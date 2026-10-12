import { MapPin, UsersRound } from "lucide-react";
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
                        <span className="aix-track-summary-step-number">01</span>
                        {industry
                            ? copy("initialDevelopment", "初赛 · 现场开发")
                            : copy("opens", "线上初赛")}
                    </dt>
                    <dd>
                        <strong>{industry ? "10.18" : "10.13–10.18"}</strong>
                        <span>
                            {industry ? "13:00–17:00" : copy("initialDeadline", "17:00 截止")}
                        </span>
                        {industry && (
                            <div className="aix-track-summary-venue">
                                <MapPin size={16} aria-hidden="true" />
                                <div>
                                    <p>{copy("campusLocation", "浙江大学紫金港校区")}</p>
                                    <p>{copy("room", "段永平教学楼 2–112")}</p>
                                </div>
                            </div>
                        )}
                        <p className="aix-track-summary-brief">
                            {industry
                                ? copy("industryBrief", "现场发布产业命题，开发 Agent 或 Skill。")
                                : copy("campusBrief", "自主命题，也可提交已有成熟项目。")}
                        </p>
                    </dd>
                </div>
                {!industry && (
                    <div>
                        <dt>
                            <span className="aix-track-summary-step-number">02</span>
                            {copy("guidance", "现场技术指导 · 自愿参加")}
                        </dt>
                        <dd>
                            <strong>10.18</strong>
                            <span>13:00–17:00</span>
                            <div className="aix-track-summary-venue">
                                <MapPin size={16} aria-hidden="true" />
                                <div>
                                    <p>{copy("campusLocation", "浙江大学紫金港校区")}</p>
                                    <p>{copy("room", "段永平教学楼 2–112")}</p>
                                </div>
                            </div>
                        </dd>
                    </div>
                )}
            </dl>
            <dl className="aix-track-summary-facts aix-track-summary-next">
                <div>
                    <dt>
                        <span className="aix-track-summary-step-number">
                            {industry ? "02" : "03"}
                        </span>
                        {copy("semifinal", "线上复赛")}
                    </dt>
                    <dd>
                        <time>10.19–10.23</time>
                        <span>{copy("semifinalDeadline", "24:00 截止")}</span>
                    </dd>
                </div>
                <div>
                    <dt>
                        <span className="aix-track-summary-step-number">
                            {industry ? "03" : "04"}
                        </span>
                        {copy("final", "决赛 · 三墩元空间")}
                    </dt>
                    <dd>
                        <time>10.25</time>
                        <span>09:10–11:30</span>
                    </dd>
                </div>
            </dl>
        </aside>
    );
}
