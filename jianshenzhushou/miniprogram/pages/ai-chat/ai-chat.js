Page({
  data: {
    messages: [],
    inputValue: '',
    loading: false,
    scrollToId: '',
    msgIdCounter: 0,
    currentDate: '',
    targetCalories: 2000,
    eatenCalories: 0,
    eatenProtein: 0,
    eatenFat: 0,
    eatenCarbs: 0,
    mealDetails: [],
    mealsSummary: '',
    todayWorkoutTitle: '',
    todayWorkoutSummary: '',
    workoutRecordsSummary: ''
  },

  async onLoad(options) {
    this.setData({
      currentDate: options.date || this._formatDate(new Date()),
      targetCalories: Number(options.target) || 2000,
      eatenCalories: Number(options.eaten) || 0,
      eatenProtein: Number(options.protein) || 0,
      eatenFat: Number(options.fat) || 0,
      eatenCarbs: Number(options.carbs) || 0
    });

    this.chatHistory = [];
    await this._reloadContext();
    this._sendAiOpening();
  },

  _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  _normalizeMealType(type) {
    const mealMap = {
      breakfast: '早餐',
      snack_am: '上午加餐',
      lunch: '午餐',
      snack_pm: '下午加餐',
      dinner: '晚餐',
      snack_ev: '夜宵'
    };
    return mealMap[type] || '加餐';
  },

  _buildMealsSummary(records = []) {
    if (!records.length) return '今天还没有饮食记录。';

    const grouped = {};
    records.forEach(item => {
      const mealName = this._normalizeMealType(item.meal_type);
      if (!grouped[mealName]) grouped[mealName] = [];
      grouped[mealName].push(item);
    });

    return Object.keys(grouped).map(mealName => {
      const foods = grouped[mealName].map(item => {
        const grams = item.grams ? `${item.grams}g` : '';
        const calories = item.calories ? `${item.calories}kcal` : '';
        return [item.food_name || '未知食物', grams, calories].filter(Boolean).join(' ');
      }).join('；');
      return `${mealName}：${foods}`;
    }).join('\n');
  },

  _calculateNutritionTotals(records = []) {
    return records.reduce((acc, item) => {
      acc.eatenCalories += Number(item.calories) || 0;
      acc.eatenProtein += Number(item.protein) || 0;
      acc.eatenFat += Number(item.fat) || 0;
      acc.eatenCarbs += Number(item.carbs) || 0;
      return acc;
    }, {
      eatenCalories: 0,
      eatenProtein: 0,
      eatenFat: 0,
      eatenCarbs: 0
    });
  },

  _formatRecordDate(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return this._formatDate(date);
  },

  _sameDate(value, targetDate) {
    return this._formatRecordDate(value) === targetDate;
  },

  _buildTodayWorkoutSummary(draft) {
    if (!draft || !Array.isArray(draft.todayWorkout) || draft.todayWorkout.length === 0) {
      return '';
    }

    const summary = draft.todayWorkout.map(exercise => {
      const completed = Array.isArray(exercise.sets)
        ? exercise.sets.filter(set => set.state === 'completed').length
        : 0;
      const total = Array.isArray(exercise.sets) ? exercise.sets.length : 0;
      return `${exercise.name}${total ? `（${completed}/${total}组已完成）` : ''}`;
    }).join('、');

    return summary || '';
  },

  _buildWorkoutRecordsSummary(records = []) {
    if (!records.length) return '暂无已保存训练记录。';

    return records.map(record => {
      const names = Array.isArray(record.exercises)
        ? record.exercises.map(item => item.name).filter(Boolean).slice(0, 3).join('、')
        : '';
      const dateLabel = record.formattedDate || this._formatRecordDate(record.createdAt) || '未知日期';
      return `${dateLabel} ${record.title || '自由训练'}${names ? `：${names}` : ''}`;
    }).join('\n');
  },

  async _loadMealDetails() {
    try {
      const db = wx.cloud.database();
      const { data } = await db.collection('diet_logs').where({
        date: this.data.currentDate
      }).get();

      const mealDetails = Array.isArray(data) ? data : [];
      const totals = this._calculateNutritionTotals(mealDetails);
      const targetCalories = Number(this.data.targetCalories) || 2000;
      this.setData({
        mealDetails,
        mealsSummary: this._buildMealsSummary(mealDetails),
        eatenCalories: Math.round(totals.eatenCalories),
        eatenProtein: Math.round(totals.eatenProtein * 10) / 10,
        eatenFat: Math.round(totals.eatenFat * 10) / 10,
        eatenCarbs: Math.round(totals.eatenCarbs * 10) / 10,
        remaining: Math.round(targetCalories - totals.eatenCalories)
      });
    } catch (err) {
      console.error('加载饮食明细失败:', err);
      this.setData({
        mealDetails: [],
        mealsSummary: '今天的饮食记录读取失败。'
      });
    }
  },

  async _loadWorkoutContext() {
    let todayWorkoutTitle = '';
    let todayWorkoutSummary = '';

    try {
      const draft = wx.getStorageSync('todayWorkoutDraft');
      if (
        draft &&
        Array.isArray(draft.todayWorkout) &&
        draft.todayWorkout.length > 0 &&
        (!draft.date || draft.date === this.data.currentDate)
      ) {
        todayWorkoutTitle = draft.todayTitle || '今日打卡';
        todayWorkoutSummary = this._buildTodayWorkoutSummary(draft);
      }
    } catch (err) {
      console.error('读取今日打卡草稿失败:', err);
    }

    try {
      const db = wx.cloud.database();
      const { data } = await db.collection('workout_records').orderBy('createdAt', 'desc').limit(5).get();
      const records = Array.isArray(data) ? data : [];
      const todayRecords = records.filter(record => this._sameDate(record.createdAt, this.data.currentDate));
      const prioritizedRecords = todayRecords.length > 0 ? todayRecords : records;

      if (!todayWorkoutSummary && prioritizedRecords.length > 0) {
        const record = prioritizedRecords[0];
        const names = Array.isArray(record.exercises)
          ? record.exercises.map(item => item.name).filter(Boolean).join('、')
          : '';
        todayWorkoutTitle = record.title || '今日训练记录';
        todayWorkoutSummary = `${record.title || '今日训练'}${names ? `：${names}` : ''}`;
      }

      this.setData({
        todayWorkoutTitle,
        todayWorkoutSummary: todayWorkoutSummary || '今天还没有今日打卡内容。',
        workoutRecordsSummary: this._buildWorkoutRecordsSummary(prioritizedRecords.slice(0, 3))
      });
    } catch (err) {
      console.error('加载训练记录失败:', err);
      this.setData({
        todayWorkoutTitle,
        todayWorkoutSummary: todayWorkoutSummary || '训练记录读取失败。',
        workoutRecordsSummary: '训练记录读取失败。'
      });
    }
  },

  async _reloadContext() {
    await this._loadMealDetails();
    await this._loadWorkoutContext();
    this._syncSystemPrompt();
  },

  _buildSystemPrompt() {
    const {
      targetCalories,
      eatenCalories,
      eatenProtein,
      eatenFat,
      eatenCarbs,
      mealsSummary,
      todayWorkoutTitle,
      todayWorkoutSummary,
      workoutRecordsSummary
    } = this.data;
    const remaining = targetCalories - eatenCalories;

    return `你是中文健身助手，请结合真实记录回答。
今日热量目标：${targetCalories} kcal
今日已摄入：${eatenCalories} kcal
蛋白质：${eatenProtein}g
脂肪：${eatenFat}g
碳水：${eatenCarbs}g
剩余热量：${remaining} kcal
今日饮食记录：
${mealsSummary}
今日打卡内容：
${todayWorkoutTitle ? `${todayWorkoutTitle}\n` : ''}${todayWorkoutSummary || '今天还没有今日打卡内容。'}
最近训练记录：
${workoutRecordsSummary}

要求：
1. 回答简洁、自然、直接。
2. 训练相关问题只基于“今日打卡内容”和“最近训练记录”来回答。
3. 回答训练问题时不要忽略最近训练记录。
4. 回答饮食问题时优先结合今日饮食记录。
5. 如果用户明确说“吃了什么/刚吃了什么/帮我记一下饮食”，请在末尾附加 $$RECORD[...]$$。
6. 如果用户明确说“练了什么/刚练完/帮我记一下训练”，请在末尾附加 $$WORKOUT[...]$$。

$$RECORD 格式：
[{"name":"食物名","meal_type":"breakfast|lunch|dinner|snack_am|snack_pm|snack_ev","grams":100,"calories":120,"protein":10,"fat":3,"carbs":15,"time_text":"今晚7点"}]

$$WORKOUT 格式：
[{"title":"胸肩训练","duration_minutes":45,"time_text":"今天下午","exercises":[{"name":"卧推","sets":4,"reps":"8-10次"},{"name":"哑铃推举","sets":4,"reps":"10次"}]}]`;
  },

  _syncSystemPrompt() {
    const systemPrompt = this._buildSystemPrompt();
    const history = Array.isArray(this.chatHistory) ? this.chatHistory : [];
    const index = history.findIndex(item => item.role === 'system');
    if (index >= 0) {
      history[index] = { role: 'system', content: systemPrompt };
    } else {
      history.unshift({ role: 'system', content: systemPrompt });
    }
    this.chatHistory = history;
  },

  _sendAiOpening() {
    const {
      targetCalories,
      eatenCalories,
      eatenProtein,
      eatenFat,
      eatenCarbs,
      mealsSummary,
      mealDetails,
      todayWorkoutTitle,
      todayWorkoutSummary,
      workoutRecordsSummary
    } = this.data;
    const remaining = targetCalories - eatenCalories;
    this._syncSystemPrompt();

    const greeting = mealDetails.length === 0
      ? `你好，我是你的 AI 综合健身助手。\n\n我看到你今天还没有饮食记录。\n\n我当前优先读取到的训练内容是：\n${todayWorkoutTitle || '今日打卡'}\n${todayWorkoutSummary || '今天还没有今日打卡内容。'}\n\n最近训练记录：\n${workoutRecordsSummary}\n\n你可以直接问我今天训练怎么练，或者让我帮你记饮食、记训练。`
      : `你好，我是你的 AI 综合健身助手。\n\n我已经读到你今天的真实饮食记录，共摄入 ${eatenCalories} kcal，还剩 ${remaining} kcal。\n\n我当前读到的是：\n${mealsSummary}\n\n我优先读取到的训练内容是：\n${todayWorkoutTitle || '今日打卡'}\n${todayWorkoutSummary || '今天还没有今日打卡内容。'}\n\n最近训练记录：\n${workoutRecordsSummary}\n\n你可以直接问我“我今天吃得怎么样”“今天训练怎么练”，也可以让我帮你记一条饮食或训练。`;

    this._addMessage('ai', greeting);
    this.chatHistory.push({ role: 'assistant', content: greeting });
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  async sendMessage() {
    const text = this.data.inputValue.trim();
    if (!text || this.data.loading) return;

    this._addMessage('user', text);
    this.setData({ inputValue: '', loading: true });
    this.chatHistory.push({ role: 'user', content: text });

    try {
      const res = await wx.cloud.callFunction({
        name: 'aiSuggest',
        data: {
          action: 'chat',
          messages: this._buildRequestMessages()
        }
      });

      if (res.result && res.result.error) {
        console.error('aiSuggest chat error:', res.result.error);
      }

      const reply = (res.result && res.result.reply)
        ? res.result.reply
        : `AI 服务异常：${(res.result && res.result.error) || '未知错误'}`;

      await this._reloadContext();
      this._addMessage('ai', reply);
      this.chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      console.error('AI 对话失败:', err);
      this._addMessage('ai', '网络异常，请稍后再试。');
    } finally {
      this.setData({ loading: false });
    }
  },

  _buildRequestMessages() {
    const history = Array.isArray(this.chatHistory) ? this.chatHistory : [];
    if (history.length === 0) return [];
    const systemMsg = history.find(m => m.role === 'system');
    const nonSystem = history.filter(m => m.role !== 'system');
    const recent = nonSystem.slice(-10);
    return systemMsg ? [systemMsg, ...recent] : recent;
  },

  _addMessage(role, content) {
    const id = this.data.msgIdCounter + 1;
    const messages = [...this.data.messages, { id, role, content }];
    this.setData({
      messages,
      msgIdCounter: id,
      scrollToId: `msg-${id}`
    });
  }
});
