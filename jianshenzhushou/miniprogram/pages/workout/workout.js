// pages/workout/workout.js
const app = getApp();

Page({
  data: {
    activeTab: 0,
    userProfile: null,
    planName: '',
    routine: [],
    generating: false,
    todayTitle: '',
    todayWorkout: [],
    workoutStatus: 'idle',
    elapsedTime: 0,
    formattedTime: '00:00:00',
    defaultRestTime: 60,
    isResting: false,
    restTimeLeft: 0,
    formattedRestTime: '00:00',
    totalRestTime: 0,
    activeSetSeconds: 0,
    workoutHistory: [],
    loadingHistory: false,
    showAIPopup: false,
    aiDays: 3,
    aiFocus: '',
    showExercisePopup: false,
    isEditingContent: false,
    currentDayIndex: -1,
    currentActionIndex: -1,
    currentExercise: { name: '', sets: '', reps: '', desc: '' },
    showAddPopup: false,
    newExName: '',
    newExSets: 4,
    showHistoryDetail: false,
    selectedHistoryRecord: null,
    savingHistoryDetail: false
  },

  timerInterval: null,
  restInterval: null,
  setTimerInterval: null,

  onLoad() {
    this.setData({ userProfile: app.globalData.userProfile });
    this.loadWeeklyPlan();
    this.restoreTodayWorkoutDraft();
  },

  onShow() {
    if (app.globalData.userProfile) {
      this.setData({ userProfile: app.globalData.userProfile });
    }
  },

  onUnload() {
    this.clearAllTimers();
  },

  clearAllTimers() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.restInterval) clearInterval(this.restInterval);
    if (this.setTimerInterval) clearInterval(this.setTimerInterval);
  },

  _getCurrentDate() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  persistTodayWorkoutDraft() {
    try {
      wx.setStorageSync('todayWorkoutDraft', {
        date: this._getCurrentDate(),
        todayTitle: this.data.todayTitle || '',
        todayWorkout: this.data.todayWorkout || [],
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn('保存今日打卡草稿失败:', err);
    }
  },

  restoreTodayWorkoutDraft() {
    try {
      const draft = wx.getStorageSync('todayWorkoutDraft');
      if (draft && draft.date && draft.date !== this._getCurrentDate()) {
        this.clearTodayWorkoutDraft();
        return;
      }
      if (draft && Array.isArray(draft.todayWorkout) && draft.todayWorkout.length > 0) {
        this.setData({
          todayTitle: draft.todayTitle || '',
          todayWorkout: draft.todayWorkout || []
        });
      }
    } catch (err) {
      console.warn('恢复今日打卡草稿失败:', err);
    }
  },

  clearTodayWorkoutDraft() {
    try {
      wx.removeStorageSync('todayWorkoutDraft');
    } catch (err) {
      console.warn('清理今日打卡草稿失败:', err);
    }
  },

  noop() {},

  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    this.setData({ activeTab: index });
    if (index === 2) this.loadWorkoutHistory();
  },

  async loadWeeklyPlan() {
    try {
      const db = wx.cloud.database();
      const { data } = await db.collection('training_plans').get();
      if (data && data.length > 0) {
        this.setData({
          planName: data[0].plan_name || '',
          routine: data[0].routine || []
        });
      }
    } catch (err) {
      console.error('获取训练计划失败:', err);
      if (err.errCode === -502005 || (err.message && err.message.includes('not exists'))) {
        wx.showToast({ title: '请在云开发后台创建 training_plans 表', icon: 'none', duration: 4000 });
      }
    }
  },

  async saveWeeklyPlan() {
    const { planName, routine } = this.data;
    if (routine.length === 0) {
      wx.showToast({ title: '没有内容可保存', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    const db = wx.cloud.database();
    const collection = db.collection('training_plans');

    try {
      const { data } = await collection.get();
      if (data && data.length > 0) {
        await collection.doc(data[0]._id).update({
          data: {
            plan_name: planName,
            routine,
            updatedAt: db.serverDate()
          }
        });
      } else {
        await collection.add({
          data: {
            plan_name: planName,
            routine,
            createdAt: db.serverDate()
          }
        });
      }
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  clearPlan() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空当前训练大纲吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ routine: [], planName: '' });
        }
      }
    });
  },

  editPlanName() {
    wx.showModal({
      title: '修改计划名称',
      editable: true,
      placeholderText: '例如：3天全身力量计划',
      success: (res) => {
        if (res.confirm && res.content) {
          this.setData({ planName: res.content });
        }
      }
    });
  },

  addDay() {
    const { routine } = this.data;
    routine.push({ dayNum: `第 ${routine.length + 1} 天`, target: '', actions: [] });
    this.setData({ routine });
  },

  deleteDay(e) {
    const index = e.currentTarget.dataset.index;
    const { routine } = this.data;
    routine.splice(index, 1);
    this.setData({ routine });
  },

  editDayTarget(e) {
    const index = e.currentTarget.dataset.index;
    const { routine } = this.data;
    wx.showModal({
      title: '设置训练目标/部位',
      editable: true,
      placeholderText: '例如：胸部 / 三头',
      success: (res) => {
        if (res.confirm && res.content) {
          routine[index].target = res.content;
          this.setData({ routine });
        }
      }
    });
  },

  addExercise(e) {
    this.setData({
      showExercisePopup: true,
      isEditingContent: false,
      currentDayIndex: e.currentTarget.dataset.dayIndex,
      currentActionIndex: -1,
      currentExercise: { name: '', sets: '', reps: '', desc: '' }
    });
  },

  editExercise(e) {
    const dayIndex = e.currentTarget.dataset.dayIndex;
    const actionIndex = e.currentTarget.dataset.actionIndex;
    const action = this.data.routine[dayIndex].actions[actionIndex];
    this.setData({
      showExercisePopup: true,
      isEditingContent: true,
      currentDayIndex: dayIndex,
      currentActionIndex: actionIndex,
      currentExercise: { ...action }
    });
  },

  deleteExercise(e) {
    const dayIndex = e.currentTarget.dataset.dayIndex;
    const actionIndex = e.currentTarget.dataset.actionIndex;
    const { routine } = this.data;
    routine[dayIndex].actions.splice(actionIndex, 1);
    this.setData({ routine });
  },

  closeExercisePopup() {
    this.setData({ showExercisePopup: false });
  },

  onExNameInput(e) { this.setData({ 'currentExercise.name': e.detail.value }); },
  onExSetsInput(e) { this.setData({ 'currentExercise.sets': e.detail.value }); },
  onExRepsInput(e) { this.setData({ 'currentExercise.reps': e.detail.value }); },
  onExDescInput(e) { this.setData({ 'currentExercise.desc': e.detail.value }); },

  saveExercise() {
    const { currentExercise, currentDayIndex, currentActionIndex, routine, isEditingContent } = this.data;
    if (!currentExercise.name || !currentExercise.sets || !currentExercise.reps) {
      wx.showToast({ title: '请填写完整动作信息', icon: 'none' });
      return;
    }
    if (isEditingContent) {
      routine[currentDayIndex].actions[currentActionIndex] = { ...currentExercise };
    } else {
      routine[currentDayIndex].actions.push({ ...currentExercise });
    }
    this.setData({ routine, showExercisePopup: false });
  },

  buildTrackerExercisesFromDay(dayData) {
    return (dayData.actions || []).map((act, index) => {
      const setsCount = parseInt(act.sets, 10) || 4;
      const sets = [];
      for (let i = 0; i < setsCount; i++) {
        sets.push({ weight: '', reps: act.reps || '', state: 'idle', setTime: 0 });
      }
      return {
        id: `ex_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`,
        name: act.name,
        sets
      };
    });
  },

  pickDayForToday(e) {
    const dayData = this.data.routine[e.currentTarget.dataset.dayIndex];
    if (this.data.workoutStatus === 'active') {
      wx.showToast({ title: '当前有正在进行的训练，请先结束', icon: 'none' });
      return;
    }

    this.setData({
      todayTitle: dayData.dayNum + (dayData.target ? ` - ${dayData.target}` : ''),
      todayWorkout: this.buildTrackerExercisesFromDay(dayData),
      activeTab: 1
    });
    this.persistTodayWorkoutDraft();
    wx.showToast({ title: '已导入今日训练', icon: 'success' });
  },

  appendDayToToday(e) {
    const dayData = this.data.routine[e.currentTarget.dataset.dayIndex];
    const trackerExercises = this.buildTrackerExercisesFromDay(dayData);
    if (!trackerExercises.length) {
      wx.showToast({ title: '这一天还没有动作', icon: 'none' });
      return;
    }

    this.setData({
      todayTitle: this.data.todayTitle || (dayData.dayNum + (dayData.target ? ` - ${dayData.target}` : '')),
      todayWorkout: [...this.data.todayWorkout, ...trackerExercises],
      activeTab: 1
    });
    this.persistTodayWorkoutDraft();
    wx.showToast({ title: '已追加到今日打卡', icon: 'success' });
  },

  startWorkout() {
    if (this.data.workoutStatus === 'active') return;
    this.setData({ workoutStatus: 'active', elapsedTime: 0, formattedTime: '00:00:00' });
    this.timerInterval = setInterval(() => {
      const newTime = this.data.elapsedTime + 1;
      this.setData({ elapsedTime: newTime, formattedTime: this.formatTime(newTime) });
    }, 1000);
  },

  async finishWorkout() {
    wx.showModal({
      title: '完成训练',
      content: '确定要结束并保存本次训练吗？',
      success: async (res) => {
        if (res.confirm) {
          this.clearAllTimers();
          wx.showLoading({ title: '保存中...' });
          await this._saveWorkoutRecord();
          wx.hideLoading();
        }
      }
    });
  },

  async _saveWorkoutRecord() {
    const { todayWorkout, elapsedTime, totalRestTime } = this.data;
    const logData = todayWorkout
      .map(ex => ({ name: ex.name, sets: ex.sets.filter(s => s.state === 'completed') }))
      .filter(ex => ex.sets.length > 0);

    if (logData.length === 0 && elapsedTime < 10) {
      wx.showToast({ title: '没有有效记录，未保存', icon: 'none' });
      this._resetTrackerState();
      return;
    }

    try {
      const db = wx.cloud.database();
      await db.collection('workout_records').add({
        data: {
          title: this.data.todayTitle || '自由加练',
          duration: elapsedTime,
          totalRestTime,
          exercises: logData,
          createdAt: db.serverDate()
        }
      });
      wx.showToast({ title: '训练已保存', icon: 'success' });
      this._resetTrackerState();
      this.loadWorkoutHistory();
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  _resetTrackerState() {
    this.setData({
      workoutStatus: 'idle',
      todayWorkout: [],
      todayTitle: '',
      elapsedTime: 0,
      formattedTime: '00:00:00',
      isResting: false,
      restTimeLeft: 0,
      totalRestTime: 0,
      activeSetSeconds: 0
    });
    this.clearTodayWorkoutDraft();
  },

  deleteTrackerExercise(e) {
    const { todayWorkout } = this.data;
    todayWorkout.splice(e.currentTarget.dataset.index, 1);
    this.setData({ todayWorkout });
    this.persistTodayWorkoutDraft();
  },

  addTrackerSet(e) {
    const exIndex = e.currentTarget.dataset.index;
    const { todayWorkout } = this.data;
    const sets = todayWorkout[exIndex].sets;
    const last = sets[sets.length - 1] || {};
    sets.push({ weight: last.weight || '', reps: last.reps || '', state: 'idle', setTime: 0 });
    this.setData({ todayWorkout });
    this.persistTodayWorkoutDraft();
  },

  removeTrackerSet(e) {
    const { todayWorkout } = this.data;
    todayWorkout[e.currentTarget.dataset.index].sets.pop();
    this.setData({ todayWorkout });
    this.persistTodayWorkoutDraft();
  },

  onSetInput(e) {
    const { ex, set, field } = e.currentTarget.dataset;
    this.setData({ [`todayWorkout[${ex}].sets[${set}].${field}`]: e.detail.value });
    this.persistTodayWorkoutDraft();
  },

  startSet(e) {
    if (this.data.workoutStatus !== 'active') {
      wx.showToast({ title: '请先点击顶部“开始训练计时”', icon: 'none' });
      return;
    }

    const { ex, set } = e.currentTarget.dataset;
    if (this.setTimerInterval) clearInterval(this.setTimerInterval);
    if (this.data.isResting) this.skipRest();

    this.setData({
      [`todayWorkout[${ex}].sets[${set}].state`]: 'active',
      activeSetSeconds: 0
    });

    this.setTimerInterval = setInterval(() => {
      this.setData({ activeSetSeconds: this.data.activeSetSeconds + 1 });
    }, 1000);
  },

  finishSet(e) {
    const { ex, set } = e.currentTarget.dataset;
    if (this.setTimerInterval) {
      clearInterval(this.setTimerInterval);
      this.setTimerInterval = null;
    }

    const { todayWorkout, activeSetSeconds } = this.data;
    todayWorkout[ex].sets[set].state = 'completed';
    todayWorkout[ex].sets[set].setTime = activeSetSeconds;
    this.setData({ todayWorkout });
    this.persistTodayWorkoutDraft();
    this.startRest(this.data.defaultRestTime);
  },

  resetSet(e) {
    const { ex, set } = e.currentTarget.dataset;
    this.setData({
      [`todayWorkout[${ex}].sets[${set}].state`]: 'idle',
      [`todayWorkout[${ex}].sets[${set}].setTime`]: 0
    });
    this.persistTodayWorkoutDraft();
  },

  startRest(seconds) {
    if (this.restInterval) clearInterval(this.restInterval);
    this.setData({
      isResting: true,
      restTimeLeft: seconds,
      formattedRestTime: this.formatRestTime(seconds)
    });

    this.restInterval = setInterval(() => {
      const left = this.data.restTimeLeft - 1;
      this.data.totalRestTime += 1;
      if (left <= 0) {
        this.skipRest();
        wx.vibrateLong && wx.vibrateLong();
        wx.showToast({ title: '休息结束', icon: 'none' });
      } else {
        this.setData({ restTimeLeft: left, formattedRestTime: this.formatRestTime(left) });
      }
    }, 1000);
  },

  skipRest() {
    if (this.restInterval) clearInterval(this.restInterval);
    this.setData({ isResting: false, restTimeLeft: 0 });
  },

  adjustRestTime(e) {
    let newLeft = this.data.restTimeLeft + parseInt(e.currentTarget.dataset.amount, 10);
    if (newLeft < 0) newLeft = 0;
    this.setData({ restTimeLeft: newLeft, formattedRestTime: this.formatRestTime(newLeft) });
    if (newLeft === 0) this.skipRest();
  },

  openAddTrackerExercisePopup() {
    this.setData({ showAddPopup: true, newExName: '', newExSets: 4 });
  },

  closeAddTrackerExercisePopup() {
    this.setData({ showAddPopup: false });
  },

  onNewExNameInput(e) { this.setData({ newExName: e.detail.value }); },
  onNewExSetsInput(e) { this.setData({ newExSets: parseInt(e.detail.value, 10) || 4 }); },

  confirmAddTrackerExercise() {
    const { newExName, newExSets, todayWorkout } = this.data;
    if (!newExName.trim()) {
      wx.showToast({ title: '请输入动作名称', icon: 'none' });
      return;
    }

    const sets = Array.from({ length: newExSets }, () => ({ weight: '', reps: '', state: 'idle', setTime: 0 }));
    const newEx = { id: `ex_${Date.now()}`, name: newExName, sets };
    this.setData({ todayWorkout: todayWorkout.concat(newEx), showAddPopup: false });
    this.persistTodayWorkoutDraft();
  },

  async loadWorkoutHistory() {
    this.setData({ loadingHistory: true });
    try {
      const db = wx.cloud.database();
      const { data } = await db.collection('workout_records').orderBy('createdAt', 'desc').limit(20).get();
      const formattedData = data.map(record => this._formatHistoryRecord(record));
      this.setData({ workoutHistory: formattedData });
    } catch (err) {
      console.error('获取训练记录失败:', err);
      if (err.errCode === -502005 || (err.message && err.message.includes('not exists'))) {
        wx.showToast({ title: '请在后台建 workout_records 表', icon: 'none', duration: 4000 });
      } else {
        wx.showToast({ title: '加载记录失败', icon: 'none' });
      }
    } finally {
      this.setData({ loadingHistory: false });
    }
  },

  _formatHistoryRecord(record = {}) {
    let dateStr = '未知时间';
    if (record.createdAt) {
      const d = new Date(record.createdAt);
      if (!Number.isNaN(d.getTime())) {
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }

    const exercises = Array.isArray(record.exercises)
      ? record.exercises.map(exercise => ({
        ...exercise,
        sets: Array.isArray(exercise.sets)
          ? exercise.sets.map(set => ({
            ...set,
            weight: set.weight === 0 ? '0' : (set.weight || ''),
            reps: set.reps === 0 ? '0' : (set.reps || '')
          }))
          : []
      }))
      : [];

    const exNames = exercises.map(e => e.name).join('、');
    return {
      ...record,
      exercises,
      formattedDate: dateStr,
      formattedDuration: this.formatFriendlyTime(record.duration || 0),
      formattedRestTime: this.formatFriendlyTime(record.totalRestTime || 0),
      exerciseSummary: exNames ? `${exNames}（共${exercises.length}个动作）` : '无动作详情'
    };
  },

  _cloneHistoryRecord(record) {
    if (!record) return null;
    return JSON.parse(JSON.stringify(record));
  },

  openHistoryDetail(e) {
    const index = Number(e.currentTarget.dataset.index);
    const record = this.data.workoutHistory[index];
    if (!record) return;
    this.setData({
      showHistoryDetail: true,
      selectedHistoryRecord: this._cloneHistoryRecord(record)
    });
  },

  closeHistoryDetail() {
    this.setData({
      showHistoryDetail: false,
      selectedHistoryRecord: null,
      savingHistoryDetail: false
    });
  },

  onHistorySetInput(e) {
    const { ex, set, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`selectedHistoryRecord.exercises[${ex}].sets[${set}].${field}`]: value
    });
  },

  async saveHistoryDetail() {
    const record = this.data.selectedHistoryRecord;
    if (!record || !record._id) return;

    this.setData({ savingHistoryDetail: true });
    wx.showLoading({ title: '保存中...' });
    try {
      const exercises = (record.exercises || []).map(exercise => ({
        ...exercise,
        sets: (exercise.sets || []).map(set => ({
          ...set,
          weight: set.weight === '' ? '' : Number(set.weight),
          reps: set.reps === '' ? '' : String(set.reps)
        }))
      }));

      const db = wx.cloud.database();
      await db.collection('workout_records').doc(record._id).update({
        data: {
          exercises,
          updatedAt: db.serverDate()
        }
      });

      const updatedRecord = this._formatHistoryRecord({
        ...record,
        exercises
      });
      const workoutHistory = this.data.workoutHistory.map(item => (
        item._id === updatedRecord._id ? updatedRecord : item
      ));

      this.setData({
        workoutHistory,
        selectedHistoryRecord: this._cloneHistoryRecord(updatedRecord)
      });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      console.error('更新训练记录失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingHistoryDetail: false });
      wx.hideLoading();
    }
  },

  async deleteHistoryRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    const res = await wx.showModal({
      title: '删除记录',
      content: '删除后无法恢复，确定删除这条训练记录吗？'
    });
    if (!res.confirm) return;

    wx.showLoading({ title: '删除中...' });
    try {
      const db = wx.cloud.database();
      await db.collection('workout_records').doc(id).remove();
      if (this.data.selectedHistoryRecord && this.data.selectedHistoryRecord._id === id) {
        this.closeHistoryDetail();
      }
      await this.loadWorkoutHistory();
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (err) {
      console.error('删除训练记录失败:', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  openWorkoutAiChat() {
    if (!app.globalData.userProfile) {
      wx.showModal({
        title: '提示',
        content: '请先前往首页完善身体数据，AI 才能更懂你',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/profile/profile' });
        }
      });
      return;
    }
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    wx.navigateTo({ url: `/pages/ai-chat/ai-chat?date=${y}-${m}-${d}` });
  },

  openAIPopup() {
    if (!app.globalData.userProfile) {
      wx.showModal({
        title: '提示',
        content: '请先前往首页完善身体数据',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/profile/profile' });
        }
      });
      return;
    }
    this.setData({ showAIPopup: true, aiDays: 3, aiFocus: '' });
  },

  closeAIPopup() { this.setData({ showAIPopup: false }); },
  onAiDaysChange(e) { this.setData({ aiDays: [1, 2, 3, 4, 5, 6, 7][e.detail.value] }); },
  onAiFocusInput(e) { this.setData({ aiFocus: e.detail.value }); },

  _getFallbackActions(target, userGoal = '', focusArea = '') {
    const text = `${target || ''} ${focusArea || ''}`.trim();
    const isFatLoss = userGoal === 'lose' || /减脂|燃脂|瘦/.test(text);
    const isStrength = /力量|大重量/.test(text);

    if (text.includes('核心') || text.includes('腹')) {
      return [
        { name: '平板支撑', sets: 3, reps: '45-60秒', desc: '核心持续收紧' },
        { name: '悬垂举腿', sets: 3, reps: '10-15次', desc: '避免摆动借力' },
        { name: '俄罗斯转体', sets: 3, reps: '每侧15-20次', desc: '保持躯干稳定' },
        { name: '死虫', sets: 3, reps: '每侧10-12次', desc: '控制腰椎位置' }
      ];
    }
    if (text.includes('胸')) {
      return [
        { name: '杠铃卧推', sets: isStrength ? 5 : 4, reps: isStrength ? '4-6次' : '6-10次', desc: '核心收紧，肩胛后缩' },
        { name: '上斜哑铃卧推', sets: 4, reps: '8-12次', desc: '上胸发力，控制离心' },
        { name: '绳索夹胸', sets: 3, reps: '12-15次', desc: '顶峰收缩1秒' },
        { name: '俯卧撑', sets: 3, reps: isFatLoss ? '15-20次' : '12-20次', desc: '全程保持身体稳定' }
      ];
    }
    if (text.includes('背')) {
      return [
        { name: '高位下拉', sets: 4, reps: '8-12次', desc: '下拉到锁骨附近' },
        { name: '杠铃划船', sets: isStrength ? 5 : 4, reps: isStrength ? '4-6次' : '6-10次', desc: '腰背稳定，肘部后拉' },
        { name: '坐姿划船', sets: 3, reps: '10-12次', desc: '感受背阔肌收缩' },
        { name: '面拉', sets: 3, reps: '12-15次', desc: '照顾后束和上背' }
      ];
    }
    if (text.includes('腿')) {
      return [
        { name: '深蹲', sets: isStrength ? 5 : 4, reps: isStrength ? '4-6次' : '6-10次', desc: '膝盖方向与脚尖一致' },
        { name: '罗马尼亚硬拉', sets: 4, reps: '8-10次', desc: '臀腿后侧发力' },
        { name: '箭步蹲', sets: 3, reps: '每侧10-12次', desc: '保持躯干稳定' },
        { name: '腿举', sets: 3, reps: isFatLoss ? '12-15次' : '10-15次', desc: '控制下放速度' }
      ];
    }
    if (text.includes('肩')) {
      return [
        { name: '坐姿推举', sets: isStrength ? 5 : 4, reps: isStrength ? '4-6次' : '6-10次', desc: '核心收紧，不要耸肩' },
        { name: '哑铃侧平举', sets: 4, reps: '12-15次', desc: '手肘微屈，小臂放松' },
        { name: '俯身飞鸟', sets: 3, reps: '12-15次', desc: '后束发力，避免借力' },
        { name: '面拉', sets: 3, reps: '12-15次', desc: '稳定肩袖' }
      ];
    }
    if (text.includes('手臂') || text.includes('二头') || text.includes('三头')) {
      return [
        { name: '窄距卧推', sets: 4, reps: '8-10次', desc: '三头主导发力' },
        { name: '绳索下压', sets: 3, reps: '12-15次', desc: '肘部固定' },
        { name: '杠铃弯举', sets: 4, reps: '8-12次', desc: '避免身体晃动' },
        { name: '锤式弯举', sets: 3, reps: '10-12次', desc: '控制下放节奏' }
      ];
    }
    if (isFatLoss) {
      return [
        { name: '壶铃深蹲', sets: 4, reps: '12-15次', desc: '控制节奏，保持心率' },
        { name: '俯身划船', sets: 4, reps: '10-12次', desc: '背部主动发力' },
        { name: '波比跳', sets: 3, reps: '10-12次', desc: '提升代谢消耗' },
        { name: '平板支撑', sets: 3, reps: '45秒', desc: '核心保持稳定' }
      ];
    }
    return [
      { name: '深蹲', sets: 4, reps: '8-10次', desc: '全身复合动作，先做大重量' },
      { name: '俯卧撑', sets: 4, reps: '10-15次', desc: '胸肩三头协同发力' },
      { name: '哑铃划船', sets: 4, reps: '10-12次', desc: '感受背部发力' },
      { name: '平板支撑', sets: 3, reps: '30-60秒', desc: '核心持续收紧' }
    ];
  },

  _normalizeAiRoutine(routine) {
    const userGoal = (this.data.userProfile && this.data.userProfile.goal) || '';
    const focusArea = this.data.aiFocus || '';
    return (Array.isArray(routine) ? routine : []).map((day, index) => {
      const target = day.target || day.focus || day.bodyPart || '全身综合';
      const rawActions = Array.isArray(day.actions) ? day.actions : (Array.isArray(day.exercises) ? day.exercises : []);
      const actions = rawActions
        .map(action => ({
          name: action.name || action.title || action.exercise || '',
          sets: parseInt(action.sets || action.groups, 10) || 4,
          reps: action.reps || action.times || action.duration || '10-12次',
          desc: action.desc || action.tip || action.note || ''
        }))
        .filter(action => action.name);

      return {
        dayNum: day.dayNum || day.day || `第 ${index + 1} 天`,
        target,
        actions: actions.length > 0 ? actions : this._getFallbackActions(target, userGoal, focusArea)
      };
    });
  },

  async generateAIPlan() {
    const { aiDays, aiFocus, routine, userProfile } = this.data;
    if (this.data.activeTab === 0 && routine.length > 0) {
      const res = await wx.showModal({ title: '覆盖提示', content: '生成新的周计划将覆盖当前未保存的周计划草稿，是否继续？' });
      if (!res.confirm) return;
    }

    this.setData({ showAIPopup: false, generating: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiSuggest',
        data: {
          action: 'suggestWorkout',
          userProfile: userProfile || app.globalData.userProfile,
          daysPerWeek: aiDays,
          focusArea: aiFocus || '全身综合'
        }
      });

      if (res.result && res.result.error) throw new Error(res.result.error);
      if (res.result && Array.isArray(res.result.routine) && res.result.routine.length > 0) {
        this.setData({
          planName: res.result.plan_name || `${aiDays}天AI定制计划`,
          routine: this._normalizeAiRoutine(res.result.routine)
        });
        wx.showToast({ title: '生成成功，可继续微调', icon: 'none' });
      } else {
        throw new Error('AI 未返回有效训练计划');
      }
    } catch (err) {
      wx.showToast({ title: err.message || 'AI 繁忙，请重试', icon: 'none' });
    } finally {
      this.setData({ generating: false });
    }
  },

  formatTime(totalSeconds) {
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  },

  formatRestTime(totalSeconds) {
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  },

  formatFriendlyTime(totalSeconds) {
    if (!totalSeconds) return '0秒';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    let str = '';
    if (h > 0) str += `${h}小时 `;
    if (m > 0 || (h > 0 && s > 0)) str += `${m}分`;
    if (h === 0 && m === 0) str += `${s}秒`;
    else if (s > 0 && h === 0) str += `${s}秒`;
    return str.trim() || '0秒';
  }
});
