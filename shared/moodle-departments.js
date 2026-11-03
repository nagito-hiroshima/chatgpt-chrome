// 学籍IDの先頭2文字とMoodle学科カテゴリの対応。
const departments = {
    "EE": { id: 2, name: "電気電子工学科" },
    "EH": { id: 3, name: "電子機械工学科" },
    "EJ": { id: 4, name: "機械工学科" },
    "EN": { id: 5, name: "基礎理工学科 数理科学専攻／基礎理工学科" },
    "EU": { id: 6, name: "基礎理工学科 環境化学専攻／環境科学科" },
    "EC": { id: 7, name: "建築学科" },
    "GP": { id: 8, name: "情報工学科" },
    "GF": { id: 9, name: "通信工学科" },
    "KC": { id: 10, name: "建築・デザイン学科 建築専攻" },
    "KD": { id: 11, name: "建築・デザイン学科 空間デザイン専攻" },
    "HL": { id: 12, name: "健康情報学科 医療工学専攻／医療科学科／医療福祉工学科" },
    "FY": { id: 13, name: "健康情報学科 理学療法学専攻／理学療法学科" },
    "FS": { id: 14, name: "健康情報学科 スポーツ科学専攻／健康スポーツ科学科" },
    "HW": { id: 15, name: "デジタルゲーム学科" },
    "HB": { id: 16, name: "ゲーム＆メディア学科" },
    "HT": { id: 17, name: "情報学科" }

};

function moodleDepartment(userId) {
    const key = typeof userId === 'string' ? userId.trim().slice(0, 2).toUpperCase() : '';
    return Object.hasOwn(departments, key) ? departments[key] : null;
}
