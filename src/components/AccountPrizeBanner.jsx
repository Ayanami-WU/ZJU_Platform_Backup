import { useEffect, useState } from "react";
import { Copy, Gift, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import api from "../services/api";
import "./AccountPrizeBanner.css";

export default function AccountPrizeBanner() {
    const { user, loading } = useAuth();
    const { uiMode } = useSettings();
    const { t } = useTranslation();
    const [result, setResult] = useState(null);
    const [dismissedUser, setDismissedUser] = useState(null);
    const [copyState, setCopyState] = useState("");
    useEffect(() => {
        if (!user?.id || loading) return undefined;
        let cancelled = false;
        api.get("/notifications/account-banner", { silent: true, noRetry: true })
            .then(({ data }) => {
                if (!cancelled) setResult({ userId: user.id, banner: data.banner });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [user?.id, loading]);
    useEffect(() => {
        if (user?.id && result?.userId === user.id && result.banner && dismissedUser !== user.id) {
            window.dispatchEvent(new Event("account-prize-banner-visible"));
        }
    }, [user?.id, result, dismissedUser]);
    if (
        !user?.id ||
        loading ||
        result?.userId !== user.id ||
        !result.banner ||
        dismissedUser === user.id
    )
        return null;
    const banner = result.banner;
    const copyContact = async () => {
        try {
            await navigator.clipboard.writeText(banner.contact);
            setCopyState("copied");
        } catch {
            setCopyState("copyFailed");
        }
    };
    return (
        <aside
            data-account-prize-banner
            className={`account-prize-banner ${uiMode === "day" ? "is-day" : "is-night"}`}
            role="status"
            aria-label={t("accountPrizeNotice.title")}
        >
            <Gift className="account-prize-icon" size={25} aria-hidden="true" />
            <div className="account-prize-copy">
                <strong>{t("accountPrizeNotice.title")}</strong>
                <p>{banner.message}</p>
                {copyState && <span>{t(`accountPrizeNotice.${copyState}`)}</span>}
            </div>
            {banner.contact && (
                <button type="button" className="account-prize-action" onClick={copyContact}>
                    <Copy size={16} aria-hidden="true" />
                    {t("accountPrizeNotice.copy")}
                </button>
            )}
            <button
                type="button"
                className="account-prize-close"
                aria-label={t("accountPrizeNotice.close")}
                onClick={() => setDismissedUser(user.id)}
            >
                <X size={19} aria-hidden="true" />
            </button>
        </aside>
    );
}
