// 云函数入口文件 - getBodyStats
// 按日期排序返回用户身体数据历史记录
const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    // 默认返回最近 90 条记录
    const limit = event.limit || 90;

    try {
        const { data } = await db.collection('body_stats')
            .where({ openid })
            .orderBy('date', 'asc')
            .limit(limit)
            .get();

        return { success: true, data };
    } catch (err) {
        console.error('getBodyStats error:', err);
        return { success: false, error: err.message, data: [] };
    }
};
