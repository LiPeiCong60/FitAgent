// 云函数入口文件 - aiSuggest
// 统一 AI 云函数：拍照识别食物 + 三餐建议 + 多轮对话
const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 硅基流动 API 配置
const API_KEY = (process.env.SILICONFLOW_API_KEY || '').trim();
const RAG_SERVICE_URL = (process.env.RAG_SERVICE_URL || '').trim();
const RAG_SERVICE_TOKEN = (process.env.RAG_SERVICE_TOKEN || '').trim();
const RAG_ENABLED = !!RAG_SERVICE_URL && process.env.RAG_ENABLED !== 'false';
const RAG_SERVICE_TIMEOUT_MS = Math.max(1000, parseInt(process.env.RAG_SERVICE_TIMEOUT_MS, 10) || 12000);
const TEXT_MODEL = 'Pro/moonshotai/Kimi-K2.5';    // 结构化/视觉任务优先稳定模型
const FAST_TEXT_MODEL = 'Pro/moonshotai/Kimi-K2.5';   // 聊天与计划生成优先低延迟模型
const VISION_MODEL = 'Pro/moonshotai/Kimi-K2.5';  // 视觉识别（官方文档推荐多模态模型）
const BACKUP_TEXT_MODEL = 'Pro/zai-org/GLM-4.7';
const HTTPS_AGENT = new https.Agent({
    keepAlive: false,
    maxSockets: 4
});
const WORKOUT_SOFT_TIMEOUT_MS = 52000;
const WORKOUT_MIN_CHUNK_BUDGET_MS = 12000;
const WORKOUT_MIN_DAY_BUDGET_MS = 7000;
const WORKOUT_CHUNK_TIMEOUT_CAP_MS = 16000;
const WORKOUT_DAY_TIMEOUT_CAP_MS = 10000;

function supportsThinkingControl(model) {
    const name = String(model || '').toLowerCase();
    return name.includes('qwen3') || name.includes('kimi-k2.5');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRemainingBudgetMs(startTime, softLimitMs = WORKOUT_SOFT_TIMEOUT_MS) {
    return Math.max(0, softLimitMs - (Date.now() - startTime));
}

function clampTimeoutByBudget(remainingMs, capMs, minMs) {
    if (remainingMs < minMs) return 0;
    return Math.max(minMs, Math.min(capMs, remainingMs - 1000));
}

function isRetryableError(err) {
    const msg = String(err && err.message ? err.message : err).toLowerCase();
    return msg.includes('timeout')
        || msg.includes('socket hang up')
        || msg.includes('econnreset')
        || msg.includes('etimedout')
        || msg.includes('network');
}

/**
 * 调用硅基流动 API
 */
async function requestAIOnce(messages, options = {}) {
    if (!API_KEY) {
        throw new Error('SILICONFLOW_API_KEY is not configured');
    }

    const opts = typeof options === 'string' ? { model: options } : options;
    const model = opts.model || TEXT_MODEL;
    const maxTokens = opts.maxTokens || 500;
    const timeoutMs = opts.timeoutMs || 30000;
    const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.5;
    const hasThinkingOption = Object.prototype.hasOwnProperty.call(opts, 'thinking');
    const thinking = supportsThinkingControl(model)
        ? (hasThinkingOption ? opts.thinking : { type: 'disabled' })
        : undefined;
    const preparedMessages = prepareMessages(messages, opts.messageLimit);

    const body = {
        model,
        messages: preparedMessages,
        temperature,
        max_tokens: maxTokens
    };
    if (thinking) body.thinking = thinking;

    const postData = JSON.stringify(body);

    console.log('[callAI] 请求模型:', model, '消息数:', preparedMessages.length);

    const response = await new Promise((resolve, reject) => {
        let settled = false;
        const finishResolve = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const finishReject = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        const options = {
            hostname: 'api.siliconflow.cn',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            agent: HTTPS_AGENT,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: timeoutMs
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (settled) return;
                console.log('[callAI] 响应状态码:', res.statusCode);
                console.log('[callAI] 响应内容前200字:', data.substring(0, 200));
                try {
                    const parsed = JSON.parse(data);
                    finishResolve(parsed);
                } catch (e) {
                    finishReject(new Error('解析响应失败: ' + data.substring(0, 200)));
                }
            });
        });

        req.on('timeout', () => {
            if (settled) return;
            req.destroy();
            finishReject(new Error(`请求超时 (${Math.round(timeoutMs / 1000)}s)`));
        });

        req.on('error', (err) => {
            if (settled) return;
            console.error('[callAI] 请求错误:', err.message);
            finishReject(err);
        });

        req.write(postData);
        req.end();
    });

    return response;
}

async function callAI(messages, options = {}) {
    const opts = typeof options === 'string' ? { model: options } : options;
    const maxAttempts = Math.max(1, parseInt(opts.retryCount, 10) || 1);
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await requestAIOnce(messages, opts);

            if (response.choices && response.choices[0]) {
                const message = response.choices[0].message;
                let finalContent = message.content || '';
                if (Array.isArray(finalContent)) {
                    finalContent = finalContent
                        .map(item => (typeof item === 'string' ? item : (item && item.text) || ''))
                        .join('\n');
                }
                finalContent = finalContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                return finalContent || '抱歉，我暂时无法回复，请稍后再试。';
            }

            if (response.error) {
                throw new Error('API 错误: ' + JSON.stringify(response.error));
            }

            throw new Error('AI 响应异常: ' + JSON.stringify(response).substring(0, 200));
        } catch (err) {
            lastErr = err;
            if (attempt >= maxAttempts || !isRetryableError(err)) {
                throw err;
            }
            await sleep(500 * attempt);
        }
    }

    throw lastErr || new Error('AI 调用失败');
}

async function callAIWithFallback(messages, options = {}) {
    const opts = typeof options === 'string' ? { model: options } : options;
    const primaryModel = opts.model || FAST_TEXT_MODEL;
    const backupModel = Object.prototype.hasOwnProperty.call(opts, 'backupModel')
        ? opts.backupModel
        : (primaryModel === TEXT_MODEL ? FAST_TEXT_MODEL : BACKUP_TEXT_MODEL);
    const errors = [];

    try {
        return await callAI(messages, {
            ...opts,
            model: primaryModel
        });
    } catch (firstErr) {
        console.error('[callAIWithFallback] 主模型失败:', firstErr.message);
        errors.push(`主模型失败: ${firstErr.message}`);

        const shouldTryBackup = backupModel
            && backupModel !== primaryModel
            && (opts.fallbackOnAnyError || isRetryableError(firstErr));

        if (!shouldTryBackup) {
            throw new Error(errors.join('; '));
        }

        try {
            return await callAI(messages, {
                ...opts,
                model: backupModel,
                maxTokens: Math.min(opts.maxTokens || 320, 320),
                timeoutMs: Math.min(opts.timeoutMs || 18000, 18000),
                temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
                thinking: undefined
            });
        } catch (secondErr) {
            console.error('[callAIWithFallback] 备用模型失败:', secondErr.message);
            errors.push(`备用模型失败: ${secondErr.message}`);
            throw new Error(errors.join('; '));
        }
    }
}

function truncateText(text, limit) {
    if (typeof text !== 'string') return text;
    if (!limit || text.length <= limit) return text;
    return `${text.slice(0, limit)}\n...[truncated]`;
}

function normalizeMessageContent(content, limit) {
    if (typeof content === 'string') return truncateText(content, limit);
    if (!Array.isArray(content)) return content;

    return content.map(item => {
        if (!item || typeof item !== 'object') return item;
        if (item.type === 'text') {
            return {
                ...item,
                text: truncateText(item.text || '', limit)
            };
        }
        return item;
    });
}

function prepareMessages(messages, config = {}) {
    if (!Array.isArray(messages)) return [];

    const {
        maxMessages = 8,
        maxSystemChars = 1200,
        maxUserChars = 900,
        maxAssistantChars = 900
    } = config || {};

    const sanitized = messages
        .filter(message => message && message.role && message.content != null)
        .map(message => {
            const limit = message.role === 'system'
                ? maxSystemChars
                : message.role === 'assistant'
                    ? maxAssistantChars
                    : maxUserChars;

            return {
                role: message.role,
                content: normalizeMessageContent(message.content, limit)
            };
        });

    const systemMessage = sanitized.find(message => message.role === 'system');
    const nonSystemMessages = sanitized.filter(message => message.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-maxMessages);

    return systemMessage ? [systemMessage, ...recentMessages] : recentMessages;
}

function extractJsonObject(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text
        .replace(/```json/gi, '```')
        .replace(/```/g, '')
        .trim();

    for (let start = 0; start < cleaned.length; start++) {
        if (cleaned[start] !== '{') continue;
        let depth = 0;
        for (let i = start; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (ch === '{') depth++;
            if (ch === '}') depth--;
            if (depth === 0) {
                const candidate = cleaned.slice(start, i + 1);
                try {
                    return JSON.parse(candidate);
                } catch (e) {
                    break;
                }
            }
        }
    }
    return null;
}

function toPositiveNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeRecognizedFood(food) {
    if (!food || typeof food !== 'object') return null;
    const grams = Math.max(1, Math.round(toPositiveNumber(food.grams, 100)));
    const caloriesPer100g = toPositiveNumber(food.calories_per_100g, toPositiveNumber(food.calories, 0));
    const totalCalories = toPositiveNumber(food.calories, Math.round(caloriesPer100g * grams / 100));

    return {
        name: food.name || '未知食物',
        grams,
        calories_per_100g: caloriesPer100g,
        calories: totalCalories,
        protein: toPositiveNumber(food.protein, 0),
        fat: toPositiveNumber(food.fat, 0),
        carbs: toPositiveNumber(food.carbs, 0)
    };
}

function extractRecognizedFoodFromText(text = '') {
    const content = String(text || '').trim();
    if (!content) return null;

    const parsed = extractJsonObject(content);
    const normalizedFromJson = normalizeRecognizedFood(parsed);
    if (normalizedFromJson) return normalizedFromJson;

    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const joined = lines.join(' ');
    const nameMatch = joined.match(/(?:食物|名称|name)[:：]\s*([^\s，,。]+)/i);
    const caloriesPer100gMatch = joined.match(/(?:每100g热量|热量\/100g|calories_per_100g)[:：]?\s*(\d+(?:\.\d+)?)/i);
    const caloriesMatch = joined.match(/(?:总热量|热量|calories)[:：]?\s*(\d+(?:\.\d+)?)/i);
    const gramsMatch = joined.match(/(?:重量|份量|grams|克数)[:：]?\s*(\d+(?:\.\d+)?)/i);
    const proteinMatch = joined.match(/(?:蛋白质|protein)[:：]?\s*(\d+(?:\.\d+)?)/i);
    const fatMatch = joined.match(/(?:脂肪|fat)[:：]?\s*(\d+(?:\.\d+)?)/i);
    const carbsMatch = joined.match(/(?:碳水|carbs|碳水化合物)[:：]?\s*(\d+(?:\.\d+)?)/i);

    return normalizeRecognizedFood({
        name: nameMatch ? nameMatch[1] : lines[0],
        grams: gramsMatch ? gramsMatch[1] : 100,
        calories_per_100g: caloriesPer100gMatch ? caloriesPer100gMatch[1] : undefined,
        calories: caloriesMatch ? caloriesMatch[1] : undefined,
        protein: proteinMatch ? proteinMatch[1] : 0,
        fat: fatMatch ? fatMatch[1] : 0,
        carbs: carbsMatch ? carbsMatch[1] : 0
    });
}

function getMealTypeByHour(hour) {
    if (hour < 10) return 'breakfast';
    if (hour < 12) return 'snack_am';
    if (hour < 15) return 'lunch';
    if (hour < 18) return 'snack_pm';
    if (hour < 21) return 'dinner';
    return 'snack_ev';
}

function normalizeMealType(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';

    const directMap = {
        breakfast: 'breakfast',
        lunch: 'lunch',
        dinner: 'dinner',
        snack: 'snack_pm',
        snack_am: 'snack_am',
        snack_pm: 'snack_pm',
        snack_ev: 'snack_ev'
    };

    if (directMap[text]) return directMap[text];
    if (text.includes('早餐') || text.includes('早饭')) return 'breakfast';
    if (text.includes('午餐') || text.includes('午饭') || text.includes('中餐')) return 'lunch';
    if (text.includes('晚餐') || text.includes('晚饭')) return 'dinner';
    if (text.includes('夜宵')) return 'snack_ev';
    if (text.includes('上午加餐') || text.includes('早加餐')) return 'snack_am';
    if (text.includes('下午加餐')) return 'snack_pm';
    if (text.includes('加餐')) return 'snack_pm';

    return '';
}

function detectMealTypeFromMessages(messages = []) {
    if (!Array.isArray(messages)) return '';

    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message || message.role !== 'user') continue;

        const mealType = normalizeMealType(message.content);
        if (mealType) return mealType;
    }

    return '';
}

function getChinaNowParts() {
    const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes()
    };
}

function formatDateParts(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function offsetDateParts(parts, offsetDays) {
    const base = Date.UTC(parts.year, parts.month - 1, parts.day);
    const shifted = new Date(base + offsetDays * 24 * 60 * 60 * 1000);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate()
    };
}

function detectDateOffset(text = '') {
    const content = String(text || '');
    if (content.includes('前天')) return -2;
    if (content.includes('昨天') || content.includes('昨晚')) return -1;
    if (content.includes('明天')) return 1;
    if (content.includes('后天')) return 2;
    return 0;
}

function inferHourFromText(text = '', fallbackHour = 12) {
    const content = String(text || '');
    const timeMatch = content.match(/(\d{1,2})\s*(?:点|时|:)(\d{1,2})?/);
    if (timeMatch) {
        let hour = Number(timeMatch[1]);
        if (content.includes('下午') || content.includes('晚上') || content.includes('傍晚')) {
            if (hour < 12) hour += 12;
        }
        if (content.includes('凌晨') && hour === 12) hour = 0;
        return Math.max(0, Math.min(23, hour));
    }

    if (content.includes('早餐') || content.includes('早饭') || content.includes('早上') || content.includes('早晨')) return 8;
    if (content.includes('上午')) return 10;
    if (content.includes('午餐') || content.includes('午饭') || content.includes('中午')) return 12;
    if (content.includes('下午')) return 16;
    if (content.includes('晚餐') || content.includes('晚饭') || content.includes('晚上') || content.includes('今晚')) return 19;
    if (content.includes('夜宵') || content.includes('宵夜') || content.includes('深夜')) return 22;

    return fallbackHour;
}

function getLastUserContent(messages = []) {
    if (!Array.isArray(messages)) return '';
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message && message.role === 'user' && typeof message.content === 'string') {
            return message.content.trim();
        }
    }
    return '';
}

function getSystemContent(messages = []) {
    const system = Array.isArray(messages)
        ? messages.find(message => message && message.role === 'system' && typeof message.content === 'string')
        : null;
    return system ? system.content : '';
}

function getLocalDateString(offsetDays = 0) {
    const shifted = new Date(Date.now() + (8 + offsetDays * 24) * 60 * 60 * 1000);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function pickFields(doc = {}, fields = []) {
    const picked = {};
    fields.forEach(field => {
        if (doc[field] != null) picked[field] = doc[field];
    });
    return picked;
}

function toMillis(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string' || typeof value === 'number') {
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
    }
    if (value.$date) {
        const time = new Date(value.$date).getTime();
        return Number.isNaN(time) ? 0 : time;
    }
    return 0;
}

function uniqueById(items = []) {
    const seen = new Set();
    const result = [];
    items.forEach(item => {
        if (!item) return;
        const key = item._id || JSON.stringify(item).slice(0, 120);
        if (seen.has(key)) return;
        seen.add(key);
        result.push(item);
    });
    return result;
}

async function queryOwnedCollection(db, collectionName, openid, where = {}, options = {}) {
    if (!openid) return [];

    const ownerQueries = [
        { openid },
        { _openid: openid }
    ];
    const rows = [];

    for (const ownerWhere of ownerQueries) {
        try {
            let query = db.collection(collectionName).where({
                ...where,
                ...ownerWhere
            });

            if (options.orderBy) {
                query = query.orderBy(options.orderBy.field, options.orderBy.direction);
            }
            if (options.limit) {
                query = query.limit(options.limit);
            }

            const { data } = await query.get();
            if (Array.isArray(data)) rows.push(...data);
        } catch (err) {
            console.warn(`[RAG] query ${collectionName} failed:`, err.message);
        }
    }

    return uniqueById(rows);
}

async function buildRagUserContext(event = {}, messages = []) {
    const db = cloud.database();
    const _ = db.command;
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID || event.user_id || event.userId || '';
    const today = getLocalDateString();
    const fromDate = getLocalDateString(-14);

    const [profiles, bodyStats, dietLogs, workoutRecords] = await Promise.all([
        queryOwnedCollection(db, 'users', openid, {}, { limit: 2 }),
        queryOwnedCollection(db, 'body_stats', openid, { date: _.gte(fromDate) }, {
            orderBy: { field: 'date', direction: 'desc' },
            limit: 12
        }),
        queryOwnedCollection(db, 'diet_logs', openid, { date: _.gte(fromDate) }, {
            orderBy: { field: 'date', direction: 'desc' },
            limit: 40
        }),
        queryOwnedCollection(db, 'workout_records', openid, {}, {
            orderBy: { field: 'createdAt', direction: 'desc' },
            limit: 12
        })
    ]);

    const profile = profiles[0] || {};
    const normalizedWorkouts = workoutRecords
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, 10)
        .map(record => ({
            date: record.date || record.formattedDate || '',
            title: record.title || '训练记录',
            duration: record.duration || 0,
            exercises: Array.isArray(record.exercises)
                ? record.exercises.slice(0, 8).map(exercise => ({
                    name: exercise.name,
                    sets: Array.isArray(exercise.sets) ? exercise.sets.length : exercise.sets
                }))
                : []
        }));

    return {
        user_id: openid,
        current_date: today,
        profile: pickFields(profile, [
            'gender',
            'age',
            'height',
            'weight',
            'goal',
            'activityLevel',
            'bmr',
            'tdee',
            'daily_calories_target',
            'carbs_ratio',
            'protein_ratio',
            'fat_ratio',
            'bodyFat',
            'leanMass',
            'waist'
        ]),
        body_stats: bodyStats
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
            .slice(0, 10)
            .map(item => pickFields(item, ['date', 'weight', 'height', 'bodyFat', 'leanMass', 'waist'])),
        recent_diet_records: dietLogs
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
            .slice(0, 40)
            .map(item => pickFields(item, [
                'date',
                'meal_type',
                'food_name',
                'grams',
                'calories',
                'protein',
                'fat',
                'carbs',
                'source',
                'time_text'
            ])),
        recent_workout_records: normalizedWorkouts,
        system_context: getSystemContent(messages),
        recent_messages: Array.isArray(messages)
            ? messages.filter(message => message && message.role !== 'system').slice(-6)
            : []
    };
}

function buildRagEndpoint(rawUrl) {
    const endpoint = new URL(rawUrl);
    if (!endpoint.pathname.endsWith('/rag/chat')) {
        endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/rag/chat`;
    }
    return endpoint;
}

async function postJson(endpoint, payload, timeoutMs) {
    const postData = JSON.stringify(payload);
    const client = endpoint.protocol === 'http:' ? http : https;

    return await new Promise((resolve, reject) => {
        let settled = false;
        const finishResolve = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const finishReject = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        };
        if (RAG_SERVICE_TOKEN) {
            headers.Authorization = `Bearer ${RAG_SERVICE_TOKEN}`;
        }

        const req = client.request({
            hostname: endpoint.hostname,
            port: endpoint.port || (endpoint.protocol === 'http:' ? 80 : 443),
            path: `${endpoint.pathname}${endpoint.search}`,
            method: 'POST',
            headers,
            timeout: timeoutMs
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (settled) return;
                let parsed = {};
                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch (err) {
                    return finishReject(new Error(`RAG response parse failed: ${data.slice(0, 160)}`));
                }

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return finishReject(new Error(`RAG HTTP ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 160)}`));
                }
                finishResolve(parsed);
            });
        });

        req.on('timeout', () => {
            if (settled) return;
            req.destroy();
            finishReject(new Error(`RAG request timeout (${Math.round(timeoutMs / 1000)}s)`));
        });
        req.on('error', finishReject);
        req.write(postData);
        req.end();
    });
}

async function tryRagChat(event = {}, messages = []) {
    if (!RAG_ENABLED) return null;

    const question = getLastUserContent(messages);
    if (!question) return null;

    try {
        const endpoint = buildRagEndpoint(RAG_SERVICE_URL);
        const userContext = await buildRagUserContext(event, messages);
        const result = await postJson(endpoint, {
            user_id: userContext.user_id || event.user_id || 'anonymous',
            question,
            user_context: userContext
        }, RAG_SERVICE_TIMEOUT_MS);

        if (result && typeof result.answer === 'string' && result.answer.trim()) {
            return {
                reply: result.answer.trim(),
                sources: Array.isArray(result.sources) ? result.sources : []
            };
        }
    } catch (err) {
        console.warn('[RAG] service unavailable, fallback to original chat:', err.message);
    }

    return null;
}

function resolveRecordTime(messages = [], explicitText = '', fallbackHour = null) {
    const nowParts = getChinaNowParts();
    const userText = getLastUserContent(messages);
    const mergedText = `${explicitText || ''} ${userText}`.trim();
    const dateParts = offsetDateParts(nowParts, detectDateOffset(mergedText));
    const hour = inferHourFromText(mergedText, fallbackHour == null ? nowParts.hour : fallbackHour);

    return {
        date: formatDateParts(dateParts),
        hour,
        timeText: explicitText || ''
    };
}

function parseFocusTags(focusArea = '', goal = '') {
    const text = `${focusArea || ''} ${goal || ''}`.toLowerCase();
    return {
        chest: /胸|chest/.test(text),
        back: /背|back/.test(text),
        legs: /腿|臀|leg|glute|lower body/.test(text),
        shoulders: /肩|shoulder/.test(text),
        arms: /手臂|二头|三头|arm|biceps|triceps/.test(text),
        core: /核心|腹|腰|core|abs/.test(text),
        fatLoss: /减脂|燃脂|瘦|fat loss|cut/.test(text) || goal === 'lose',
        muscleGain: /增肌|肌肥大|围度|muscle|hypertrophy|gain/.test(text) || goal === 'gain',
        strength: /力量|大重量|strength/.test(text),
        endurance: /耐力|体能|心肺|endurance/.test(text),
        fullBody: /全身|综合|full body/.test(text)
    };
}

function buildActionLibrary(tags) {
    const library = {
        chest: [
            { name: '杠铃卧推', sets: tags.strength ? 5 : 4, reps: tags.strength ? '4-6次' : '8-10次', desc: '肩胛后缩，下放稳定' },
            { name: '上斜哑铃卧推', sets: 4, reps: '8-12次', desc: '上胸主导，控制离心' },
            { name: '绳索夹胸', sets: 3, reps: '12-15次', desc: '顶峰收缩1秒' },
            { name: '俯卧撑', sets: 3, reps: tags.endurance || tags.fatLoss ? '15-20次' : '10-15次', desc: '保持身体一条直线' }
        ],
        back: [
            { name: '高位下拉', sets: 4, reps: '8-12次', desc: '下拉到锁骨附近' },
            { name: '杠铃划船', sets: tags.strength ? 5 : 4, reps: tags.strength ? '4-6次' : '8-10次', desc: '腰背稳定，肘部后拉' },
            { name: '坐姿划船', sets: 3, reps: '10-12次', desc: '感受背阔肌收缩' },
            { name: '面拉', sets: 3, reps: '12-15次', desc: '照顾后束和上背' }
        ],
        legs: [
            { name: '深蹲', sets: tags.strength ? 5 : 4, reps: tags.strength ? '4-6次' : '8-10次', desc: '膝盖方向与脚尖一致' },
            { name: '罗马尼亚硬拉', sets: 4, reps: '8-10次', desc: '臀腿后侧发力' },
            { name: '箭步蹲', sets: 3, reps: '每侧10-12次', desc: '保持躯干稳定' },
            { name: '腿举', sets: 3, reps: tags.fatLoss ? '12-15次' : '10-12次', desc: '控制下放速度' }
        ],
        shoulders: [
            { name: '坐姿推举', sets: tags.strength ? 5 : 4, reps: tags.strength ? '4-6次' : '8-10次', desc: '核心收紧，不要耸肩' },
            { name: '哑铃侧平举', sets: 4, reps: '12-15次', desc: '手肘微屈，小臂放松' },
            { name: '俯身飞鸟', sets: 3, reps: '12-15次', desc: '后束发力，避免借力' },
            { name: '面拉', sets: 3, reps: '12-15次', desc: '稳定肩袖' }
        ],
        arms: [
            { name: '窄距卧推', sets: 4, reps: '8-10次', desc: '三头主导发力' },
            { name: '绳索下压', sets: 3, reps: '12-15次', desc: '肘部固定' },
            { name: '杠铃弯举', sets: 4, reps: '8-12次', desc: '避免身体晃动借力' },
            { name: '锤式弯举', sets: 3, reps: '10-12次', desc: '控制下放节奏' }
        ],
        core: [
            { name: '平板支撑', sets: 3, reps: '45-60秒', desc: '核心持续收紧' },
            { name: '悬垂举腿', sets: 3, reps: '10-15次', desc: '避免摆动' },
            { name: '俄罗斯转体', sets: 3, reps: '每侧15-20次', desc: '躯干稳定旋转' },
            { name: '死虫', sets: 3, reps: '每侧10-12次', desc: '保持腰椎稳定' }
        ],
        conditioning: [
            { name: '跳绳', sets: 4, reps: '60秒', desc: '均匀呼吸，提高心率' },
            { name: '波比跳', sets: 3, reps: '12-15次', desc: '动作完整，控制落地' },
            { name: '登山跑', sets: 3, reps: '40秒', desc: '核心收紧，快而不乱' },
            { name: '划船机冲刺', sets: 6, reps: '30秒冲刺+30秒恢复', desc: '维持高输出' }
        ],
        fullBody: [
            { name: '深蹲', sets: 4, reps: '8-10次', desc: '全身复合动作' },
            { name: '俯卧撑', sets: 4, reps: '10-15次', desc: '胸肩三头协同发力' },
            { name: '哑铃划船', sets: 4, reps: '10-12次', desc: '感受背部发力' },
            { name: '平板支撑', sets: 3, reps: '30-60秒', desc: '核心持续收紧' }
        ]
    };

    if (tags.fatLoss) {
        library.fullBody = [
            { name: '壶铃深蹲', sets: 4, reps: '12-15次', desc: '控制节奏，保持心率' },
            { name: '俯身划船', sets: 4, reps: '10-12次', desc: '背部主动发力' },
            { name: '波比跳', sets: 3, reps: '10-12次', desc: '提升代谢消耗' },
            { name: '平板支撑', sets: 3, reps: '45秒', desc: '核心保持稳定' }
        ];
    }

    return library;
}

function pickTrainingTargets(daysPerWeek, focusArea = '', goal = '') {
    const safeDays = Math.min(7, Math.max(1, parseInt(daysPerWeek, 10) || 3));
    const tags = parseFocusTags(focusArea, goal);
    const targets = [];

    if (tags.fullBody || (!tags.chest && !tags.back && !tags.legs && !tags.shoulders && !tags.arms && !tags.core)) {
        if (safeDays <= 2) return ['全身力量', tags.fatLoss ? '全身燃脂' : '全身综合'].slice(0, safeDays);
        if (safeDays === 3) return ['推训练', '拉训练', tags.fatLoss ? '下肢+燃脂' : '腿部+核心'];
        if (safeDays === 4) return ['上肢推', '下肢力量', '上肢拉', tags.fatLoss ? '全身代谢' : '核心+补强'];
        return ['胸肩三头', '背部二头', '腿臀', '肩部+核心', tags.fatLoss ? '全身燃脂' : '弱项补强'].slice(0, safeDays);
    }

    if (tags.chest) targets.push('胸部重点');
    if (tags.back) targets.push('背部重点');
    if (tags.legs) targets.push('腿臀重点');
    if (tags.shoulders) targets.push('肩部重点');
    if (tags.arms) targets.push('手臂重点');
    if (tags.core) targets.push('核心重点');
    if (tags.fatLoss) targets.push('燃脂体能');

    const filler = tags.muscleGain
        ? ['胸肩三头', '背部二头', '腿臀', '核心+补强', '弱项补强']
        : ['全身综合', '上肢综合', '下肢综合', '核心稳定', '体能循环'];

    while (targets.length < safeDays) {
        targets.push(filler[targets.length % filler.length]);
    }

    return targets.slice(0, safeDays);
}

function buildActionsForTarget(target, focusArea = '', goal = '') {
    const tags = parseFocusTags(`${target} ${focusArea}`, goal);
    const library = buildActionLibrary(tags);
    const groups = [];
    const text = `${target || ''}`.toLowerCase();

    if (/推|胸/.test(target) || text.includes('chest')) groups.push(library.chest);
    if (/拉|背/.test(target) || text.includes('back')) groups.push(library.back);
    if (/腿|臀|下肢/.test(target) || text.includes('leg')) groups.push(library.legs);
    if (/肩/.test(target) || text.includes('shoulder')) groups.push(library.shoulders);
    if (/手臂|二头|三头/.test(target) || text.includes('arm')) groups.push(library.arms);
    if (/核心/.test(target) || text.includes('core')) groups.push(library.core);
    if (/燃脂|体能|代谢/.test(target) || tags.fatLoss || tags.endurance) groups.push(library.conditioning);
    if (groups.length === 0) groups.push(library.fullBody);

    const merged = [];
    groups.forEach(group => {
        group.forEach(action => {
            if (!merged.find(item => item.name === action.name)) {
                merged.push(action);
            }
        });
    });

    return merged.slice(0, 5);
}

function buildWorkoutPlanFallback(daysPerWeek, focusArea = '', userProfile = {}) {
    const safeDays = Math.min(7, Math.max(1, parseInt(daysPerWeek, 10) || 3));
    const goal = userProfile && userProfile.goal ? userProfile.goal : '';
    const targets = pickTrainingTargets(safeDays, focusArea, goal);
    const goalLabel = goal === 'lose' ? '减脂' : goal === 'gain' ? '增肌' : '健康';
    const focusLabel = (focusArea || '').trim() || '个性化';

    return {
        plan_name: `${safeDays}天${focusLabel}${goalLabel}计划`,
        routine: targets.map((target, index) => ({
            dayNum: `第 ${index + 1} 天`,
            target,
            actions: buildActionsForTarget(target, focusArea, goal)
        }))
    };
}

function normalizeWorkoutPlan(plan, daysPerWeek, focusArea, userProfile = {}) {
    const safeDays = Math.min(7, Math.max(1, parseInt(daysPerWeek, 10) || 3));
    const rawRoutine = Array.isArray(plan && plan.routine) ? plan.routine : [];
    const fallbackPlan = buildWorkoutPlanFallback(safeDays, focusArea, userProfile);
    const normalized = [];

    for (let i = 0; i < safeDays; i++) {
        const srcDay = rawRoutine[i] || {};
        const actions = Array.isArray(srcDay.actions)
            ? srcDay.actions
            : Array.isArray(srcDay.exercises)
                ? srcDay.exercises
                : [];
        const fallbackDay = fallbackPlan.routine[i];
        normalized.push({
            dayNum: srcDay.dayNum || srcDay.day || fallbackDay.dayNum,
            target: srcDay.target || srcDay.focus || srcDay.bodyPart || fallbackDay.target,
            actions: (actions.length > 0 ? actions : fallbackDay.actions).map(act => ({
                name: act.name || act.title || act.exercise || '基础动作',
                sets: parseInt(act.sets || act.groups, 10) || 4,
                reps: act.reps || act.times || act.duration || '10-12次',
                desc: act.desc || act.tip || act.note || ''
            }))
        });
    }

    return {
        plan_name: (plan && plan.plan_name) || fallbackPlan.plan_name,
        routine: normalized
    };
}

function normalizeWorkoutActions(actions = []) {
    return (Array.isArray(actions) ? actions : []).map(act => ({
        name: act.name || act.title || act.exercise || '基础动作',
        sets: parseInt(act.sets || act.groups, 10) || 4,
        reps: act.reps || act.times || act.duration || '8-12次',
        desc: act.desc || act.tip || act.note || ''
    })).filter(act => act.name);
}

function expandWorkoutTarget(target = '') {
    const text = String(target || '').trim();
    if (text === '上肢推') return '胸肩三头推训练';
    if (text === '上肢拉') return '背部后肩二头拉训练';
    if (text === '下肢力量') return '腿臀下肢力量训练';
    if (text === '核心+补强') return '核心稳定与薄弱环节补强训练';
    if (text === '全身力量') return '全身复合力量训练';
    return text;
}

async function generateWorkoutDayWithAI({ target, dayIndex, userProfile = {}, focusArea = '', timeoutMs = WORKOUT_DAY_TIMEOUT_CAP_MS }) {
    const {
        goal = '',
        activityLevel = '',
        gender = 'unknown',
        age = '',
        height = '',
        weight = ''
    } = userProfile || {};
    const expandedTarget = expandWorkoutTarget(target);

    const messages = [
        {
            role: 'system',
            content: '你是专业中文健身教练。请只返回合法 JSON 数组，不要解释。格式：[{"name":"动作","sets":4,"reps":"8-12次","desc":"要点"}]。只返回 3-4 个动作。'
        },
        {
            role: 'user',
            content: `请为第 ${dayIndex + 1} 天的“${expandedTarget}”生成动作。
用户信息：性别 ${gender}，年龄 ${age || '未知'}，身高 ${height || '未知'} cm，体重 ${weight || '未知'} kg。
目标：${goal || '保持健康'}；运动频率：${activityLevel || '未知'}；重点部位：${focusArea || '无'}。
要求：动作必须符合“${expandedTarget}”，desc 简短实用。`
        }
    ];

    const result = await callAIWithFallback(messages, {
        model: TEXT_MODEL,
        backupModel: BACKUP_TEXT_MODEL,
        maxTokens: 220,
        timeoutMs: Math.max(6000, Math.min(timeoutMs, WORKOUT_DAY_TIMEOUT_CAP_MS)),
        temperature: 0.3,
        retryCount: 1,
        messageLimit: {
            maxMessages: 2,
            maxSystemChars: 400,
            maxUserChars: 500
        }
    });

    const parsed = extractJsonObject(result);
    if (parsed && Array.isArray(parsed.actions)) {
        const normalized = normalizeWorkoutActions(parsed.actions);
        if (normalized.length > 0) return normalized;
    }

    try {
        const arr = JSON.parse(result.replace(/```json/gi, '').replace(/```/g, '').trim());
        const normalized = normalizeWorkoutActions(arr);
        if (normalized.length > 0) return normalized;
    } catch (err) {
        // Fall through to final parse error
    }

    throw new Error(`第 ${dayIndex + 1} 天动作解析失败`);
}

async function generateWorkoutChunkWithAI({ targets = [], startIndex = 0, userProfile = {}, focusArea = '', timeoutMs = WORKOUT_CHUNK_TIMEOUT_CAP_MS }) {
    const {
        goal = '',
        activityLevel = '',
        gender = 'unknown',
        age = '',
        height = '',
        weight = ''
    } = userProfile || {};
    const targetText = targets.map((target, index) => `第 ${startIndex + index + 1} 天：${expandWorkoutTarget(target)}`).join('\n');
    const messages = [
        {
            role: 'system',
            content: '你是专业中文健身教练。请只返回合法 JSON，不要解释。格式：{"routine":[{"dayNum":"第1天","target":"训练重点","actions":[{"name":"动作","sets":4,"reps":"8-12次","desc":"要点"}]}]}。每一天只给 3-4 个动作。'
        },
        {
            role: 'user',
            content: `请为以下训练日生成计划：\n${targetText}\n用户信息：性别 ${gender}，年龄 ${age || '未知'}，身高 ${height || '未知'} cm，体重 ${weight || '未知'} kg，目标 ${goal || '保持健康'}，运动频率 ${activityLevel || '未知'}，重点部位 ${focusArea || '无'}。`
        }
    ];

    const result = await callAIWithFallback(messages, {
        model: TEXT_MODEL,
        backupModel: BACKUP_TEXT_MODEL,
        maxTokens: 360,
        timeoutMs: Math.max(8000, Math.min(timeoutMs, WORKOUT_CHUNK_TIMEOUT_CAP_MS)),
        temperature: 0.3,
        retryCount: 1,
        messageLimit: {
            maxMessages: 2,
            maxSystemChars: 450,
            maxUserChars: 600
        }
    });

    const parsed = extractJsonObject(result);
    const routine = normalizeWorkoutPlan(parsed || {}, targets.length, focusArea, userProfile).routine;
    if (routine && routine.length >= targets.length) {
        return routine.slice(0, targets.length).map((day, index) => ({
            dayNum: `第 ${startIndex + index + 1} 天`,
            target: targets[index],
            actions: normalizeWorkoutActions(day.actions)
        }));
    }

    throw new Error(`第 ${startIndex + 1}-${startIndex + targets.length} 天计划解析失败`);
}

async function mapWithConcurrency(items, limit, iterator) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++;
            results[currentIndex] = await iterator(items[currentIndex], currentIndex);
        }
    }

    const workerCount = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

function trimChatMessages(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    const system = messages.find(m => m && m.role === 'system');
    const nonSystem = messages.filter(m => m && m.role !== 'system');
    const recent = nonSystem.slice(-10);
    return system ? [system, ...recent] : recent;
}

function extractTaggedJsonArray(text, tagName) {
    const regex = new RegExp(`\\$\\$${tagName}\\[([\\s\\S]*?)\\]\\$\\$`);
    const match = String(text || '').match(regex);
    if (!match) return [];
    const jsonText = `[${match[1]}]`;
    return JSON.parse(jsonText);
}

async function summarizeDailyDietV2(event) {
    const {
        targetCalories = 2000,
        eatenCalories = 0,
        eatenProtein = 0,
        eatenFat = 0,
        eatenCarbs = 0,
        mealsSummary = ''
    } = event;

    const messages = [
        {
            role: 'system',
            content: '你是专业营养师。请用简洁中文总结用户今天的饮食表现，给出评分（满分100）和1到2条实用建议，控制在80字内。'
        },
        {
            role: 'user',
            content: `今日饮食数据：
目标热量：${targetCalories} kcal
实际摄入：${eatenCalories} kcal
蛋白质：${eatenProtein}g
脂肪：${eatenFat}g
碳水：${eatenCarbs}g

饮食记录：
${mealsSummary || '今天还没有详细饮食记录'}

请输出精炼总结。`
        }
    ];

    const summary = await callAIWithFallback(messages, {
        model: TEXT_MODEL,
        backupModel: BACKUP_TEXT_MODEL,
        maxTokens: 220,
        timeoutMs: 20000,
        temperature: 0.4,
        retryCount: 1,
        fallbackOnAnyError: true,
        thinking: { type: 'disabled' }
    });

    return { summary };
}

function stripHiddenRecordTags(text = '') {
    return String(text || '')
        .replace(/\$\$RECORD\[[\s\S]*?\]\$\$/g, '')
        .replace(/\$\$WORKOUT\[[\s\S]*?\]\$\$/g, '')
        .trim();
}

/**
 * 拍照识别食物
 */
async function recognizeFood(imageFileID) {
    if (!imageFileID) {
        return { food: null, error: '缺少图片文件' };
    }

    const errors = [];

    try {
        const buildMessages = (imageUrl) => ([
            {
                role: 'system',
                content: '你是一个专业的营养师。用户会发送食物图片，你需要识别食物并估算营养成分。优先返回严格 JSON，不要解释。JSON 格式：{"name":"食物名称","calories_per_100g":数字,"protein":数字,"fat":数字,"carbs":数字,"grams":估算总重量克数}'
            },
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
                    { type: 'text', text: '请识别这张图片中的食物，估算营养成分（每100g）和总份量。' }
                ]
            }
        ]);

        // 优先使用云存储临时 URL，避免大图 base64 触发解析失败
        const tempRes = await cloud.getTempFileURL({ fileList: [imageFileID] });
        const tempItem = tempRes && tempRes.fileList && tempRes.fileList[0];
        const tempUrl = tempItem && tempItem.tempFileURL;
        let result = '';

        if (tempUrl) {
            try {
                result = await callAI(buildMessages(tempUrl), {
                    model: VISION_MODEL,
                    maxTokens: 500,
                    timeoutMs: 45000,
                    retryCount: 2,
                    thinking: { type: 'disabled' }
                });
            } catch (urlErr) {
                errors.push(`临时URL识图失败: ${urlErr.message}`);
                console.warn('临时URL识图失败，回退base64:', urlErr.message);
            }
        } else {
            errors.push('未获取到图片临时链接');
        }

        if (!result) {
            const res = await cloud.downloadFile({ fileID: imageFileID });
            const base64 = res.fileContent.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            try {
                result = await callAI(buildMessages(dataUrl), {
                    model: VISION_MODEL,
                    maxTokens: 500,
                    timeoutMs: 70000,
                    retryCount: 2,
                    thinking: { type: 'disabled' }
                });
            } catch (base64Err) {
                errors.push(`base64识图失败: ${base64Err.message}`);
                throw base64Err;
            }
        }

        const normalized = extractRecognizedFoodFromText(result);
        if (normalized) {
            return { food: normalized };
        }

        errors.push(`识图结果解析失败: ${String(result || '').slice(0, 120)}`);
    } catch (err) {
        errors.push(err.message);
        console.error('下载图片或调用大模型识别失败:', err);
    }

    return {
        food: null,
        error: errors.filter(Boolean).join('; ') || 'AI 未返回可解析的识别结果'
    };
}

/**
 * AI 三餐建议
 */
async function suggestMeal(params) {
    const { targetCalories, eatenCalories, eatenProtein, eatenFat, eatenCarbs } = params;
    const meals = Array.isArray(params.meals) ? params.meals : [];
    const remaining = targetCalories - eatenCalories;

    let mealsSummary = '';
    meals.forEach(m => {
        if (m.foods && m.foods.length > 0) {
            mealsSummary += `${m.name}: ${m.foods.join('、')}\n`;
        }
    });

    const messages = [
        {
            role: 'system',
            content: '你是专业营养师。请用中文直接给出下一餐建议，只输出 2-3 条，每条包含食物、份量和理由，总字数控制在 120 字内。'
        },
        {
            role: 'user',
            content: `我的每日目标热量是 ${targetCalories} kcal。
今天已摄入：${eatenCalories} kcal（蛋白质 ${eatenProtein}g、脂肪 ${eatenFat}g、碳水 ${eatenCarbs}g）
剩余：${remaining} kcal

${mealsSummary ? '已吃的食物：\n' + mealsSummary : '今天还没有记录任何食物。'}

请根据剩余热量推荐下一餐，只给最适合的 2-3 个选项。`
        }
    ];

    let suggestion = '';
    try {
        suggestion = await callAIWithFallback(messages, {
            model: TEXT_MODEL,
            backupModel: BACKUP_TEXT_MODEL,
            maxTokens: 160,
            timeoutMs: 20000,
            temperature: 0.4,
            retryCount: 1,
            fallbackOnAnyError: true
        });
    } catch (err) {
        console.error('生成饮食建议失败:', err);
        throw err;
    }
    return { suggestion };
}

/**
 * AI 训练计划建议 (支持自定义天数和侧重部位)
 */
async function suggestWorkout(params) {
    const { userProfile, daysPerWeek = 3, focusArea = '鍏ㄨ韩缁煎悎' } = params;
    const safeProfile = userProfile || {};
    const {
        goal = '',
    } = safeProfile;
    try {
        const startedAt = Date.now();
        const safeDays = Math.min(7, Math.max(1, parseInt(daysPerWeek, 10) || 3));
        const fallbackPlan = buildWorkoutPlanFallback(safeDays, focusArea, safeProfile);
        const targets = pickTrainingTargets(safeDays, focusArea, goal);
        const routine = [];

        for (let i = 0; i < targets.length; i += 2) {
            const chunkTargets = targets.slice(i, i + 2);
            const remainingForChunk = getRemainingBudgetMs(startedAt);
            const chunkTimeoutMs = clampTimeoutByBudget(
                remainingForChunk,
                WORKOUT_CHUNK_TIMEOUT_CAP_MS,
                WORKOUT_MIN_CHUNK_BUDGET_MS
            );

            if (!chunkTimeoutMs) {
                const fallbackPlan = buildWorkoutPlanFallback(safeDays, focusArea, safeProfile);
                routine.push(...fallbackPlan.routine.slice(i));
                break;
            }

            try {
                const chunkRoutine = await generateWorkoutChunkWithAI({
                    targets: chunkTargets,
                    startIndex: i,
                    userProfile: safeProfile,
                    focusArea,
                    timeoutMs: chunkTimeoutMs
                });
                routine.push(...chunkRoutine);
            } catch (chunkErr) {
                console.error('[suggestWorkout] chunk generation failed, using fallback:', chunkErr.message);
                routine.push(...fallbackPlan.routine.slice(i, i + chunkTargets.length));
            }
        }

        return {
            plan_name: fallbackPlan.plan_name,
            routine
        };
    } catch (err) {
        console.error('[suggestWorkout] failed:', err);
        console.log('AI workout generation failed, using local fallback plan');
        const fallbackPlan = buildWorkoutPlanFallback(
            Math.min(7, Math.max(1, parseInt(daysPerWeek, 10) || 3)),
            focusArea,
            safeProfile
        );
        fallbackPlan.fromFallback = true;
        return fallbackPlan;
    }
}
exports.main = async (event) => {
    const { action } = event;

    console.log('[aiSuggest] runtime check:', {
        version: 'rag-env-check-2026-06-05',
        action,
        hasSiliconFlowApiKey: !!API_KEY,
        ragEnabled: RAG_ENABLED,
        hasRagServiceUrl: !!RAG_SERVICE_URL,
        hasRagServiceToken: !!RAG_SERVICE_TOKEN
    });

    try {
        switch (action) {
            case 'recognizeFood':
                return await recognizeFood(event.imageFileID);

            case 'suggestMeal':
                return await suggestMeal(event);

            case 'summarizeDailyDiet':
                return await summarizeDailyDietV2(event);


            case 'chat':
                // 多轮对话
                let reply = '';
                let ragSources = [];
                try {
                    const chatMessages = trimChatMessages(event.messages);
                    const ragResult = await tryRagChat(event, chatMessages);

                    if (ragResult) {
                        reply = ragResult.reply;
                        ragSources = ragResult.sources;
                    } else {
                        reply = await callAIWithFallback(chatMessages, {
                            model: TEXT_MODEL,
                            backupModel: BACKUP_TEXT_MODEL,
                            maxTokens: 220,
                            timeoutMs: 20000,
                            temperature: 0.3,
                            retryCount: 2,
                            messageLimit: {
                                maxMessages: 5,
                                maxSystemChars: 700,
                                maxUserChars: 400,
                                maxAssistantChars: 300
                            }
                        });
                    }
                } catch (chatErr) {
                    return {
                        reply: 'AI 服务暂时不可用，请稍后重试。',
                        error: chatErr.message
                    };
                }
                let savedDietRecords = 0;
                let savedWorkoutRecords = 0;
                const db = cloud.database();
                const wxContext = cloud.getWXContext();
                const openid = wxContext.OPENID || '';

                try {
                    const dietRecords = extractTaggedJsonArray(reply, 'RECORD');
                    const inferredMealType = detectMealTypeFromMessages(event.messages);

                    for (const record of dietRecords) {
                        const resolvedTime = resolveRecordTime(event.messages, record.time_text || record.timeText || '', null);
                        const explicitMealType = normalizeMealType(record.meal_type || record.mealType || record.meal);
                        const mealType = explicitMealType || inferredMealType || getMealTypeByHour(resolvedTime.hour);

                        const dietData = {
                            date: resolvedTime.date,
                            meal_type: mealType,
                            food_name: record.name || 'AI记录食物',
                            grams: record.grams || 100,
                            calories: record.calories || 0,
                            protein: record.protein || 0,
                            fat: record.fat || 0,
                            carbs: record.carbs || 0,
                            time_text: resolvedTime.timeText || '',
                            source: 'ai-chat',
                            createdAt: db.serverDate()
                        };
                        if (openid) dietData.openid = openid;

                        await db.collection('diet_logs').add({ data: dietData });
                        savedDietRecords += 1;
                    }
                } catch (e) {
                    console.error('AI 饮食记录解析或写库失败:', e);
                }

                try {
                    const workoutRecords = extractTaggedJsonArray(reply, 'WORKOUT');

                    for (const workout of workoutRecords) {
                        const resolvedTime = resolveRecordTime(event.messages, workout.time_text || workout.timeText || '', 19);
                        const exercises = Array.isArray(workout.exercises)
                            ? workout.exercises
                                .filter(item => item && item.name)
                                .map(item => ({
                                    name: item.name,
                                    sets: Array.from({ length: Math.max(1, parseInt(item.sets, 10) || 1) }, () => ({
                                        weight: '',
                                        reps: item.reps || '',
                                        state: 'completed',
                                        setTime: 0
                                    }))
                                }))
                            : [];

                        const workoutData = {
                            title: workout.title || 'AI对话记录训练',
                            date: resolvedTime.date,
                            time_text: resolvedTime.timeText || '',
                            duration: Math.max(0, parseInt(workout.duration_minutes || workout.duration || 0, 10) || 0) * 60,
                            totalRestTime: 0,
                            exercises,
                            source: 'ai-chat',
                            createdAt: db.serverDate()
                        };
                        if (openid) workoutData.openid = openid;

                        await db.collection('workout_records').add({ data: workoutData });
                        savedWorkoutRecords += 1;
                    }
                } catch (e) {
                    console.error('AI 训练记录解析或写库失败:', e);
                }

                reply = stripHiddenRecordTags(reply);

                if (!reply && (savedDietRecords > 0 || savedWorkoutRecords > 0)) {
                    const messages = [];
                    if (savedDietRecords > 0) messages.push(`已记录 ${savedDietRecords} 条饮食`);
                    if (savedWorkoutRecords > 0) messages.push(`已记录 ${savedWorkoutRecords} 条训练`);
                    reply = `${messages.join('，')}。`;
                }

                return { reply, rag: { used: ragSources.length > 0, sources: ragSources } };

            case 'suggestWorkout':
                return await suggestWorkout(event);

        }
    } catch (err) {
        console.error(`aiSuggest [${action}] error:`, err);
        return { error: err.message };
    }
};
