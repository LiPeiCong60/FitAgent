// 云函数入口文件 - saveUserProfile
// 保存用户 Profile 并同步 body_stats 快照（全字段互通）
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

    const userData = {
        openid,
        gender: event.gender,
        age: event.age,
        height: event.height,
        weight: event.weight,
        goal: event.goal,
        activityLevel: event.activityLevel,
        bmr: event.bmr,
        tdee: event.tdee,
        daily_calories_target: event.daily_calories_target,
        carbs_ratio: event.carbs_ratio,
        protein_ratio: event.protein_ratio,
        fat_ratio: event.fat_ratio,
        updatedAt: db.serverDate()
    };

    // 保留 body 相关扩展字段（如果存在）
    if (event.bodyFat != null) userData.bodyFat = parseFloat(event.bodyFat);
    if (event.leanMass != null) userData.leanMass = parseFloat(event.leanMass);
    if (event.waist != null) userData.waist = parseFloat(event.waist);

    try {
        const { data } = await db.collection('users').where({ openid }).get();

        if (data.length > 0) {
            await db.collection('users').doc(data[0]._id).update({
                data: userData
            });
        } else {
            userData.createdAt = db.serverDate();
            await db.collection('users').add({ data: userData });
        }

        // 同步写入 body_stats 快照（当天覆盖）
        const today = getLocalDateString();
        const snapshot = {
            openid,
            date: today,
            updatedAt: db.serverDate()
        };

        // 同步所有身体数据字段
        if (event.weight != null) snapshot.weight = parseFloat(event.weight);
        if (event.height != null) snapshot.height = parseFloat(event.height);
        if (event.bodyFat != null) snapshot.bodyFat = parseFloat(event.bodyFat);
        if (event.leanMass != null) snapshot.leanMass = parseFloat(event.leanMass);
        if (event.waist != null) snapshot.waist = parseFloat(event.waist);

        // 只有当快照中有身体数据时才写入
        const hasBodyData = ['weight', 'height', 'bodyFat', 'leanMass', 'waist']
            .some(k => snapshot[k] != null);

        if (hasBodyData) {
            try {
                const { data: statsData } = await db.collection('body_stats')
                    .where({ openid, date: today })
                    .get();

                if (statsData.length > 0) {
                    await db.collection('body_stats').doc(statsData[0]._id).update({
                        data: snapshot
                    });
                } else {
                    snapshot.createdAt = db.serverDate();
                    await db.collection('body_stats').add({ data: snapshot });
                }
            } catch (statsErr) {
                console.warn('body_stats 同步失败（不影响主流程）:', statsErr);
            }
        }

        return { success: true };
    } catch (err) {
        console.error('saveUserProfile error:', err);
        return { success: false, error: err.message };
    }
};
