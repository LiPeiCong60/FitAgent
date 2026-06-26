// pages/body-stats/body-stats.js
const app = getApp();

// 指标颜色配置
const METRIC_COLORS = {
    weight: { line: '#1a1a1a', fill: 'rgba(26,26,26,0.10)', dot: '#1a1a1a' },
    bodyFat: { line: '#e74c3c', fill: 'rgba(231,76,60,0.10)', dot: '#e74c3c' },
    height: { line: '#3498db', fill: 'rgba(52,152,219,0.10)', dot: '#3498db' },
    leanMass: { line: '#2ecc71', fill: 'rgba(46,204,113,0.10)', dot: '#2ecc71' },
    waist: { line: '#f39c12', fill: 'rgba(243,156,18,0.10)', dot: '#f39c12' }
};

Page({
    data: {
        // 图表模式: 'overview' 总览 | 单指标 key
        chartMode: 'overview',
        tabs: [
            { key: 'overview', label: '总览', icon: '📊' },
            { key: 'weight', label: '体重', unit: 'kg', icon: '⚖️', color: '#1a1a1a' },
            { key: 'bodyFat', label: '体脂', unit: '%', icon: '🔥', color: '#e74c3c' },
            { key: 'height', label: '身高', unit: 'cm', icon: '📏', color: '#3498db' },
            { key: 'leanMass', label: '瘦体重', unit: 'kg', icon: '💪', color: '#2ecc71' },
            { key: 'waist', label: '腰围', unit: 'cm', icon: '📐', color: '#f39c12' }
        ],

        // 最新值汇总
        latestWeight: '--',
        latestBodyFat: '--',
        latestHeight: '--',
        latestLeanMass: '--',
        latestWaist: '--',

        // 变化趋势标记
        weightTrend: '',
        bodyFatTrend: '',

        // 历史记录
        records: [],

        // 表单输入
        inputWeight: '',
        inputHeight: '',
        inputBodyFat: '',
        inputLeanMass: '',
        inputWaist: '',
        leanMassAutoCalc: false,

        // 状态
        saving: false,
        loading: true
    },

    onShow() {
        this._loadData();
    },

    onReady() {
        this._initCanvas();
    },

    _toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    },

    _calcLeanMass(weight, bodyFat) {
        const w = this._toNumber(weight);
        const bf = this._toNumber(bodyFat);
        if (w == null || bf == null || bf < 0 || bf >= 100) return null;
        return Math.round(w * (1 - bf / 100) * 10) / 10;
    },

    _normalizeRecord(record = {}) {
        const weight = this._toNumber(record.weight);
        const height = this._toNumber(record.height);
        const bodyFat = this._toNumber(record.bodyFat);
        const waist = this._toNumber(record.waist);
        const rawLeanMass = this._toNumber(record.leanMass);
        const leanMass = rawLeanMass != null ? rawLeanMass : this._calcLeanMass(weight, bodyFat);

        return {
            ...record,
            weight,
            height,
            bodyFat,
            waist,
            leanMass
        };
    },

    _normalizeRecords(records = []) {
        return (Array.isArray(records) ? records : [])
            .map(item => this._normalizeRecord(item))
            .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    },

    _getChartBounds(values = [], metricKey = '') {
        const validValues = (Array.isArray(values) ? values : []).filter(v => v != null);
        if (validValues.length === 0) {
            return { min: 0, max: 1, range: 1 };
        }

        const rawMin = Math.min(...validValues);
        const rawMax = Math.max(...validValues);

        if (rawMin === rawMax) {
            const basePadding = metricKey === 'bodyFat' ? 0.5 : metricKey === 'height' ? 2 : 1;
            const dynamicPadding = Math.abs(rawMin) * 0.02;
            const padding = Math.max(basePadding, dynamicPadding);
            return {
                min: rawMin - padding,
                max: rawMax + padding,
                range: padding * 2
            };
        }

        const padding = (rawMax - rawMin) * 0.1;
        return {
            min: rawMin - padding,
            max: rawMax + padding,
            range: (rawMax - rawMin) + padding * 2
        };
    },

    _initCanvas() {
        const query = this.createSelectorQuery();
        query.select('#statsCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res || !res[0]) return;

                const canvas = res[0].node;
                const width = res[0].width;
                const height = res[0].height;

                const dpr = wx.getWindowInfo().pixelRatio;
                canvas.width = width * dpr;
                canvas.height = height * dpr;

                const ctx = canvas.getContext('2d');
                ctx.scale(dpr, dpr);

                this._canvas = canvas;
                this._ctx = ctx;
                this._canvasWidth = width;
                this._canvasHeight = height;

                if (this.data.records.length > 0) {
                    this._drawChart();
                }
            });
    },

    async _loadData() {
        this.setData({ loading: true });

        try {
            // 1. 从 users 集合读取当前 Profile 数据（确保互通）
            const db = wx.cloud.database();
            const profileRes = await db.collection('users').get();
            const profile = (profileRes.data && profileRes.data.length > 0) ? profileRes.data[0] : null;

            if (profile) {
                app.globalData.userProfile = profile;
            }

            // 2. 加载 body_stats 历史记录
            const statsRes = await wx.cloud.callFunction({ name: 'getBodyStats' });
            const rawRecords = (statsRes.result && statsRes.result.data) || [];
            const records = this._normalizeRecords(rawRecords);

            // 3. 综合最新数据：优先取 body_stats 最新记录，否则用 profile
            const latest = records.length > 0 ? records[records.length - 1] : {};
            const prev = records.length > 1 ? records[records.length - 2] : null;

            const latestWeight = latest.weight != null ? latest.weight : (profile ? profile.weight : null);
            const latestHeight = latest.height != null ? latest.height : (profile ? profile.height : null);
            const latestBodyFat = latest.bodyFat != null ? latest.bodyFat : this._toNumber(profile ? profile.bodyFat : null);
            const latestLeanMass = latest.leanMass != null
                ? latest.leanMass
                : this._toNumber(profile ? profile.leanMass : null) != null
                    ? this._toNumber(profile ? profile.leanMass : null)
                    : this._calcLeanMass(latestWeight, latestBodyFat);
            const latestWaist = latest.waist != null ? latest.waist : this._toNumber(profile ? profile.waist : null);

            // 计算趋势
            let weightTrend = '';
            let bodyFatTrend = '';
            if (prev) {
                if (prev.weight != null && latest.weight != null) {
                    weightTrend = latest.weight > prev.weight ? '↑' : (latest.weight < prev.weight ? '↓' : '—');
                }
                if (prev.bodyFat != null && latest.bodyFat != null) {
                    bodyFatTrend = latest.bodyFat > prev.bodyFat ? '↑' : (latest.bodyFat < prev.bodyFat ? '↓' : '—');
                }
            }

            // 预填输入框
            const inputWeight = latestWeight != null ? String(latestWeight) : '';
            const inputHeight = latestHeight != null ? String(latestHeight) : '';

            // 自动计算瘦体重：体重 × (1 - 体脂率/100)
            let autoLeanMass = '';
            let leanMassAutoCalc = false;
            if (latestBodyFat != null && latestWeight != null) {
                autoLeanMass = this._calcLeanMass(latestWeight, latestBodyFat).toFixed(1);
                leanMassAutoCalc = true;
            }

            this.setData({
                records,
                latestWeight: latestWeight != null ? latestWeight : '--',
                latestBodyFat: latestBodyFat != null ? latestBodyFat : '--',
                latestHeight: latestHeight != null ? latestHeight : '--',
                latestLeanMass: latestLeanMass != null ? latestLeanMass : (autoLeanMass || '--'),
                latestWaist: latestWaist != null ? latestWaist : '--',
                weightTrend,
                bodyFatTrend,
                inputWeight,
                inputHeight,
                inputBodyFat: latestBodyFat != null ? String(latestBodyFat) : '',
                inputLeanMass: latestLeanMass != null ? String(latestLeanMass) : autoLeanMass,
                inputWaist: latestWaist != null ? String(latestWaist) : '',
                leanMassAutoCalc: latestLeanMass == null && leanMassAutoCalc,
                loading: false
            });

            if (this._ctx) {
                this._drawChart();
            }
        } catch (err) {
            console.error('加载身体数据失败:', err);
            this.setData({ loading: false });
        }
    },

    // ---- Tab 切换 ----
    onTabChange(e) {
        const key = e.currentTarget.dataset.key;
        this.setData({ chartMode: key });
        if (this._ctx) {
            this._drawChart();
        }
    },

    // ---- 输入处理 ----
    onWeightInput(e) {
        this.setData({ inputWeight: e.detail.value });
        this._autoCalcLeanMass();
    },

    onHeightInput(e) {
        this.setData({ inputHeight: e.detail.value });
    },

    onBodyFatInput(e) {
        this.setData({ inputBodyFat: e.detail.value });
        this._autoCalcLeanMass();
    },

    onLeanMassInput(e) {
        this.setData({ inputLeanMass: e.detail.value, leanMassAutoCalc: false });
    },

    onWaistInput(e) {
        this.setData({ inputWaist: e.detail.value });
    },

    // 自动计算瘦体重：瘦体重 = 体重 × (1 - 体脂率/100)
    _autoCalcLeanMass() {
        const { inputWeight, inputBodyFat } = this.data;
        if (inputWeight && inputBodyFat) {
            const w = parseFloat(inputWeight);
            const bf = parseFloat(inputBodyFat);
            if (!isNaN(w) && !isNaN(bf) && bf > 0 && bf < 100) {
                const leanMass = (w * (1 - bf / 100)).toFixed(1);
                this.setData({ inputLeanMass: leanMass, leanMassAutoCalc: true });
            }
        }
    },

    // ---- 保存 ----
    async onSave() {
        const { inputWeight, inputHeight, inputBodyFat, inputLeanMass, inputWaist } = this.data;

        if (!inputWeight && !inputHeight && !inputBodyFat && !inputLeanMass && !inputWaist) {
            wx.showToast({ title: '请至少填写一项数据', icon: 'none' });
            return;
        }

        this.setData({ saving: true });

        const payload = {};
        if (inputWeight) payload.weight = parseFloat(inputWeight);
        if (inputHeight) payload.height = parseFloat(inputHeight);
        if (inputBodyFat) payload.bodyFat = parseFloat(inputBodyFat);
        if (inputLeanMass) payload.leanMass = parseFloat(inputLeanMass);
        if (inputWaist) payload.waist = parseFloat(inputWaist);

        try {
            const res = await wx.cloud.callFunction({
                name: 'saveBodyStats',
                data: payload
            });

            if (res.result && res.result.success) {
                wx.showToast({ title: '记录成功', icon: 'success' });

                // 同步 globalData
                if (app.globalData.userProfile) {
                    if (payload.weight) app.globalData.userProfile.weight = payload.weight;
                    if (payload.height) app.globalData.userProfile.height = payload.height;
                }

                await this._loadData();
            } else {
                throw new Error(res.result ? res.result.error : '未知错误');
            }
        } catch (err) {
            console.error('保存身体数据失败:', err);
            wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        } finally {
            this.setData({ saving: false });
        }
    },

    // =============================================
    //  Canvas 折线图绘制
    // =============================================
    _drawChart() {
        const ctx = this._ctx;
        const W = this._canvasWidth;
        const H = this._canvasHeight;
        const { records, chartMode } = this.data;

        if (!ctx || !W || !H) return;
        ctx.clearRect(0, 0, W, H);

        if (records.length === 0) {
            ctx.fillStyle = '#999999';
            ctx.font = '14px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('暂无数据，请先录入', W / 2, H / 2);
            return;
        }

        if (chartMode === 'overview') {
            this._drawOverviewChart(ctx, W, H);
        } else {
            this._drawSingleChart(ctx, W, H, chartMode);
        }
    },

    // ---- 总览模式：所有指标归一化后叠加绘制 ----
    _drawOverviewChart(ctx, W, H) {
        const { records, tabs } = this.data;
        const metricKeys = ['weight', 'bodyFat', 'height', 'leanMass', 'waist'];

        const padLeft = 20;
        const padRight = 20;
        const padTop = 20;
        const padBottom = 50;

        const chartW = W - padLeft - padRight;
        const chartH = H - padTop - padBottom;

        const allDates = records.map(r => r.date ? r.date.slice(5) : '');

        // 背景网格
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padTop + (i / 4) * chartH;
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(W - padRight, y);
            ctx.stroke();
        }

        // X 轴日期
        const maxDateLabels = 7;
        records.forEach((r, i) => {
            if (records.length <= maxDateLabels ||
                i % Math.ceil(records.length / maxDateLabels) === 0 ||
                i === records.length - 1) {
                const x = padLeft + (records.length === 1 ? chartW / 2 : (i / (records.length - 1)) * chartW);
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '10px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(allDates[i], x, H - padBottom + 16);
            }
        });

        // 为每个指标绘制折线
        let legendItems = [];
        metricKeys.forEach(key => {
            const color = METRIC_COLORS[key];
            const tabInfo = tabs.find(t => t.key === key);
            const values = records.map(r => r[key]);

            const validIndices = [];
            const validValues = [];
            values.forEach((v, i) => {
                if (v != null) {
                    validIndices.push(i);
                    validValues.push(v);
                }
            });

            if (validValues.length < 1) return;

            legendItems.push({ label: tabInfo.label, color: color.line });

            const bounds = this._getChartBounds(validValues, key);

            const points = validIndices.map((idx, j) => ({
                x: padLeft + (records.length === 1 ? chartW / 2 : (idx / (records.length - 1)) * chartW),
                y: padTop + chartH - ((validValues[j] - bounds.min) / bounds.range) * chartH * 0.85 - chartH * 0.075
            }));

            // 折线
            ctx.beginPath();
            ctx.strokeStyle = color.line;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            points.forEach((p, j) => {
                if (j === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();

            // 数据点
            points.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.strokeStyle = color.line;
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        });

        // 底部图例
        const legendY = H - 10;
        const legendGap = chartW / (legendItems.length + 1);
        legendItems.forEach((item, i) => {
            const x = padLeft + legendGap * (i + 1);
            ctx.beginPath();
            ctx.arc(x - 20, legendY - 4, 4, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.fill();
            ctx.fillStyle = '#666666';
            ctx.font = '11px -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(item.label, x - 12, legendY);
        });
    },

    // ---- 单指标模式 ----
    _drawSingleChart(ctx, W, H, metricKey) {
        const { records, tabs } = this.data;
        const color = METRIC_COLORS[metricKey];
        const tabInfo = tabs.find(t => t.key === metricKey);
        const unit = tabInfo ? tabInfo.unit : '';

        const filtered = records.filter(r => r[metricKey] != null);

        if (filtered.length === 0) {
            ctx.fillStyle = '#999999';
            ctx.font = '14px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('暂无数据，请先录入', W / 2, H / 2);
            return;
        }

        const values = filtered.map(r => r[metricKey]);
        const dates = filtered.map(r => r.date ? r.date.slice(5) : '');

        const bounds = this._getChartBounds(values, metricKey);

        const padLeft = 50;
        const padRight = 24;
        const padTop = 32;
        const padBottom = 40;

        const chartW = W - padLeft - padRight;
        const chartH = H - padTop - padBottom;

        const points = values.map((v, i) => ({
            x: padLeft + (filtered.length === 1 ? chartW / 2 : (i / (filtered.length - 1)) * chartW),
            y: padTop + chartH - ((v - bounds.min) / bounds.range) * chartH
        }));

        // 网格 + Y 轴
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padTop + (i / 4) * chartH;
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(W - padRight, y);
            ctx.stroke();

            const labelVal = bounds.max - (i / 4) * bounds.range;
            ctx.fillStyle = '#999999';
            ctx.font = '11px -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(labelVal.toFixed(1), padLeft - 8, y + 4);
        }

        // 渐变填充
        const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
        gradient.addColorStop(0, color.fill.replace('0.10', '0.15'));
        gradient.addColorStop(1, color.fill.replace('0.10', '0.02'));

        ctx.beginPath();
        ctx.moveTo(points[0].x, padTop + chartH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padTop + chartH);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // 折线
        ctx.beginPath();
        ctx.strokeStyle = color.line;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // 数据点 + 日期
        points.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = color.line;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            if (filtered.length <= 8 || i % Math.ceil(filtered.length / 8) === 0 || i === filtered.length - 1) {
                ctx.fillStyle = '#999999';
                ctx.font = '10px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(dates[i], p.x, H - 10);
            }
        });

        // 最新值标注
        if (points.length > 0) {
            const last = points[points.length - 1];
            const lastVal = values[values.length - 1];
            const text = `${lastVal} ${unit}`;
            ctx.font = 'bold 12px -apple-system, sans-serif';
            const tw = ctx.measureText(text).width;

            ctx.fillStyle = color.line;
            const bx = last.x - tw / 2 - 6;
            const by = last.y - 28;
            const bw = tw + 12;
            const bh = 20;
            ctx.beginPath();
            ctx.moveTo(bx + 4, by);
            ctx.lineTo(bx + bw - 4, by);
            ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 4);
            ctx.lineTo(bx + bw, by + bh - 4);
            ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 4, by + bh);
            ctx.lineTo(bx + 4, by + bh);
            ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 4);
            ctx.lineTo(bx, by + 4);
            ctx.quadraticCurveTo(bx, by, bx + 4, by);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(text, last.x, by + 14);
        }
    }
});
