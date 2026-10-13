import { useRef } from "react";
import { QrCode, X } from "lucide-react";
import { useTranslation } from "react-i18next";
export default function AiXRegistrationInfo() {
    const { t } = useTranslation();
    const dialog = useRef(null);
    return (
        <div className="aix-group-control">
            <button
                type="button"
                className="hx-outline"
                aria-haspopup="dialog"
                onClick={() => dialog.current?.showModal()}
            >
                <QrCode size={18} />
                {t("aix.pages.group")}
            </button>
            <dialog ref={dialog} className="aix-qr-dialog" aria-label={t("aix.pages.group")}>
                <form method="dialog">
                    <button autoFocus aria-label={t("aix.landing.closeQr")}>
                        <X size={22} />
                    </button>
                </form>
                <div className="aix-qr-instructions">
                    <h2>{t("aix.landing.memberQrTitle")}</h2>
                    <p>{t("aix.landing.memberQrHint")}</p>
                    <p className="aix-qr-remark">{t("aix.landing.memberQrRemark")}</p>
                </div>
                <img
                    src="/images/hackathon/ai-x/official/wechat-assistant.jpg"
                    alt={t("aix.landing.qrAlt")}
                    width="888"
                    height="1131"
                />
            </dialog>
        </div>
    );
}
