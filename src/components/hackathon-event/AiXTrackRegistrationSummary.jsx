import { CalendarDays, MapPin, UsersRound, Code2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./AiXTrackRegistrationSummary.css";

export default function AiXTrackRegistrationSummary({ track }) {
    const { t } = useTranslation();
    const industry = track === "industry";
    const copy = (key, fallback) =>
        t(`aix.register.trackSummary.${key}`, { defaultValue: fallback });
    return (
        <aside
            className="aix-track-registration-summary"
            aria-label={copy("label", "参赛安排")}
            data-track={track}
        >
            <div className="aix-track-summary-heading">
                <span>{industry ? "01" : "02"}</span>
                <h2>
                    {industry
                        ? copy("industryTitle", "华为 · 产业进阶赛道")
                        : copy("campusTitle", "天猫 · OPC孵化赛道")}
                </h2>
            </div>
            <p className="aix-track-summary-format">
                <UsersRound size={18} />
                {industry
                    ? copy("industryFormat", "个人参赛 · 必须线下")
                    : copy("campusFormat", "1–5 人组队 · 可线上参赛")}
            </p>
            <dl className="aix-track-summary-facts">
                <div>
                    <dt>
                        <CalendarDays size={18} />
                        {industry ? copy("development", "现场开发") : copy("opens", "线上开启")}
                    </dt>
                    <dd>
                        <strong>{industry ? "10.18" : "10.13"}</strong>
                        {industry && <span>13:00–17:00</span>}
                    </dd>
                </div>
                <div>
                    <dt>
                        <MapPin size={18} />
                        {industry
                            ? copy("venue", "参赛地点")
                            : copy("guidance", "现场技术指导 · 自愿参加")}
                    </dt>
                    <dd>
                        {!industry && <p>10.18 · 13:00–17:00</p>}
                        <p>{copy("campusLocation", "浙江大学紫金港校区")}</p>
                        <p>{copy("room", "段永平教学楼 2–112")}</p>
                    </dd>
                </div>
                <div>
                    <dt>
                        <Code2 size={18} />
                        {copy("brief", "赛制")}
                    </dt>
                    <dd>
                        {industry
                            ? copy("industryBrief", "现场发布产业命题，开发 Agent 或 Skill。")
                            : copy("campusBrief", "自主命题，也可提交已有成熟项目。")}
                    </dd>
                </div>
            </dl>
            <div className="aix-track-summary-next">
                <p>
                    <time>10.19–23</time>
                    <span>{copy("semifinal", "线上复赛")}</span>
                </p>
                <p>
                    <time>10.25</time>
                    <span>{copy("final", "决赛 · 三墩元空间")}</span>
                </p>
            </div>
        </aside>
    );
}
