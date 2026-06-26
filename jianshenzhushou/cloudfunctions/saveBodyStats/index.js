// 云函数入口文件 - saveBodyStats
// 保存身体数据快照（同日覆盖），同时同步更新 users 集合（全字段互通）
const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function getLocalDateString() {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai'
    }).format(new Date());
}

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    const today = event.date || getLocalDateString();

    // 构建身体数据快照（只保存有值的字段）
    const statsData = { openid, date: today };

    if (event.weight != null) statsData.weight = parseFloat(event.weight);
    if (event.height != null) statsData.height = parseFloat(event.height);
    if (event.bodyFat != null) statsData.bodyFat = parseFloat(event.bodyFat);
    if (event.leanMass != null) statsData.leanMass = parseFloat(event.leanMass);
    if (event.waist != null) statsData.waist = parseFloat(event.waist);

    statsData.updatedAt = db.serverDate();

    try {
        // 1. 保存/更新 body_stats（同日覆盖）
        const { data: existing } = await db.collection('body_stats')
            .where({ openid, date: today })
            .get();

        if (existing.length > 0) {
            await db.collection('body_stats').doc(existing[0]._id).update({
                data: statsData
            });
        } else {
            statsData.createdAt = db.serverDate();
            await db.collection('body_stats').add({ data: statsData });
        }

        // 2. 同步更新 users 集合（全部已提交字段都同步）
        const userUpdate = {};
        if (statsData.weight != null) userUpdate.weight = statsData.weight;
        if (statsData.height != null) userUpdate.height = statsData.height;
        if (statsData.bodyFat != null) userUpdate.bodyFat = statsData.bodyFat;
        if (statsData.leanMass != null) userUpdate.leanMass = statsData.leanMass;
        if (statsData.waist != null) userUpdate.waist = statsData.waist;

        if (Object.keys(userUpdate).length > 0) {
            userUpdate.updatedAt = db.serverDate();
            const { data: users } = await db.collection('users')
                .where({ openid })
                .get();

            if (users.length > 0) {
                await db.collection('users').doc(users[0]._id).update({
                    data: userUpdate
                });
            }
        }

        return { success: true };
    } catch (err) {
        console.error('saveBodyStats error:', err);
        return { success: false, error: err.message };
    }
};
