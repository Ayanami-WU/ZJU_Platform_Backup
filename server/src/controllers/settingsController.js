const { getDb } = require("../config/db");
const footerAcknowledgements = require("../../../shared/footerAcknowledgements.json");
const { EDITABLE_SETTING_KEYS } = require("../middleware/validate");
const { PAGE_CONTENT_KEYS, isPlatformAdmin } = require("../utils/userPermissions");

// Public settings are presentation data. New database keys stay private by default.
// Event data is served by the dedicated, filtered hackathon endpoints.
const PUBLIC_SETTING_KEYS = new Set([
    "site_title",
    "site_description",
    "site_name",
    "footer_acknowledgements",
    "allow_registrations",
    "maintenance_mode",
    "theme_color",
    "favicon_url",
    "hero_title",
    "hero_subtitle",
    "hero_bg_url",
    "about_title",
    "about_subtitle",
    "profile_image_url",
    "about_intro",
    "about_detail",
    "about_exp_years",
    "about_exhibitions",
    "about_projects",
    "social_github",
    "social_twitter",
    "social_instagram",
    "social_linkedin",
    "about_team_title",
    "about_team_subtitle",
    "about_team_intro_1",
    "about_team_intro_2",
    "about_support_units",
    "about_stat_1_value",
    "about_stat_1_label",
    "about_stat_2_value",
    "about_stat_2_label",
    "about_stat_3_value",
    "about_stat_3_label",
    "about_community_title",
    "about_community_tagline",
    "about_community_desc",
    "about_community_bullets",
    "about_hackathon_title",
    "about_hackathon_tagline",
    "about_hackathon_desc",
    "about_hackathon_bullets",
    "about_flagship_title",
    "about_flagship_note",
    "about_support_title",
    "about_support_desc",
    "about_support_positioning",
    "about_support_method",
    "about_support_result",
    "about_final_title",
    "about_final_desc",
    "about_final_note",
    "background_brightness",
    "background_opacity",
    "background_bloom",
    "background_vignette",
    "theme_card_opacity",
    "theme_glass_blur",
    "theme_accent",
    "theme_bg_color",
    "pagination_enabled",
    "language",
]);

const readSettings = async (db, keys) => {
    const allowed = [...keys];
    const rows = await db.all(
        `SELECT key, value FROM settings WHERE key IN (${allowed.map(() => "?").join(",")})`,
        allowed
    );
    return Object.fromEntries([
        ["footer_acknowledgements", footerAcknowledgements.join("\n")],
        ...rows.map(({ key, value }) => [key, value]),
    ]);
};

const getSettings = async (req, res, next) => {
    try {
        const db = await getDb();
        res.set("Cache-Control", "no-store");
        res.json(await readSettings(db, PUBLIC_SETTING_KEYS));
    } catch (error) {
        next(error);
    }
};

const getAdminSettings = async (req, res, next) => {
    try {
        const db = await getDb();
        const keys = isPlatformAdmin(req.user) ? EDITABLE_SETTING_KEYS : PAGE_CONTENT_KEYS;
        res.set("Cache-Control", "private, no-store");
        res.json(await readSettings(db, keys));
    } catch (error) {
        next(error);
    }
};

const updateSetting = async (req, res, next) => {
    try {
        const db = await getDb();
        const { key, value } = req.body;
        await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
            key,
            String(value),
        ]);
        res.json({ success: true, key, value });
    } catch (error) {
        next(error);
    }
};

module.exports = { getSettings, getAdminSettings, updateSetting };
