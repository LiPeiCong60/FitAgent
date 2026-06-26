const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { taskId } = event;

  if (!taskId) {
    return { success: false, error: 'taskId is required' };
  }

  const { data } = await db.collection('motion_tasks').doc(taskId).get();
  if (!data) {
    return { success: false, error: 'task not found' };
  }
  if (data.openid !== OPENID) {
    return { success: false, error: 'forbidden' };
  }

  return { success: true, task: data };
};
