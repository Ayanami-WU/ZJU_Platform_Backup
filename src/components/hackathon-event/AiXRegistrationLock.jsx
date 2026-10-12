import { LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./AiXRegistrationPreview.css";

export default function AiXRegistrationLock({ onLogin, loading = false, message }) {
    const { t } = useTranslation();

    return (
        <div className="aix-registration-lock">
            <div className="aix-registration-lock-content">
                <LockKeyhole aria-hidden="true" />
                <p>
                    {message ||
                        t("aix.register.loginPreview", {
                            defaultValue: "请先注册或登录，再填写报名信息。",
                        })}
                </p>
                <button type="button" className="aix-primary" onClick={onLogin} disabled={loading}>
                    {t("accountProfile.loginOrRegister")}
                </button>
            </div>
        </div>
    );
}
