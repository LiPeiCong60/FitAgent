const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const limit = Math.min(50, Math.max(1, Number(event.limit || 20)));

  const { data } = await db.collection('motion_tasks')
    .where({ openid: OPENID })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return {
    success: true,
    tasks: data
  };
};
