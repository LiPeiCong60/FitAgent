const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const {
    callbackToken,
    taskId,
    status,
    result = null,
    score = null,
    summary = '',
    reps = null,
    duration = null,
    errorMessage = ''
  } = event;

  if (!taskId) {
    return { success: false, error: 'taskId is required' };
  }
  if (!callbackToken || callbackToken !== process.env.MOTION_CALLBACK_TOKEN) {
    return { success: false, error: 'invalid callback token' };
  }

  const updateData = {
    status,
    updatedAt: db.serverDate()
  };

  if (summary) updateData.summary = summary;
  if (result !== null) updateData.result = result;
  if (score !== null) updateData.score = score;
  if (reps !== null) updateData.reps = reps;
  if (duration !== null) updateData.duration = duration;
  if (errorMessage) updateData.errorMessage = errorMessage;

  if (status === 'success' || status === 'failed') {
    updateData.finishedAt = db.serverDate();
  }

  await db.collection('motion_tasks').doc(taskId).update({
    data: updateData
  });

  return { success: true };
};
