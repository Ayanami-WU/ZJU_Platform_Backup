import { LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLayoutEffect, useRef } from "react";
import { AIX_PHONE_LAYOUT } from "../../hooks/useAiXMobileLayout";
import "./AiXRegistrationPreview.css";

export default function AiXRegistrationLock({ onLogin, loading = false, message }) {
    const { t } = useTranslation();
    const lockRef = useRef(null);
    useLayoutEffect(() => {
        const lock = lockRef.current;
        const card = lock?.firstElementChild;
        if (!lock || !card) return;
        const phone = window.matchMedia(AIX_PHONE_LAYOUT);
        let frame = 0;
        const update = () => {
            frame = 0;
            if (!phone.matches) {
                lock.removeAttribute("data-visible-center");
                lock.style.removeProperty("--aix-lock-center");
                return;
            }
            const rect = lock.getBoundingClientRect();
            const viewport = window.visualViewport;
            const viewportTop = viewport?.offsetTop || 0;
            const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
            const header = lock.closest(".hx-workspace")?.querySelector(".hx-eventbar");
            const bottomNav = document.querySelector("nav.fixed.bottom-0");
            const bottomRect = bottomNav?.getBoundingClientRect();
            const top = Math.max(
                rect.top,
                viewportTop,
                header?.getBoundingClientRect().bottom || 0
            );
            const bottom = Math.min(
                rect.bottom,
                viewportBottom,
                bottomRect?.height ? bottomRect.top : viewportBottom
            );
            const visible = bottom - top >= card.offsetHeight + 16;
            lock.dataset.visibleCenter = String(visible);
            if (!visible) return;
            const half = card.offsetHeight / 2;
            const center = Math.min(
                rect.height - half,
                Math.max(half, (top + bottom) / 2 - rect.top)
            );
            lock.style.setProperty("--aix-lock-center", `${center}px`);
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        const sizes = new ResizeObserver(schedule);
        sizes.observe(lock);
        sizes.observe(card);
        window.addEventListener("scroll", schedule, true);
        window.addEventListener("resize", schedule);
        phone.addEventListener("change", schedule);
        window.visualViewport?.addEventListener("resize", schedule);
        window.visualViewport?.addEventListener("scroll", schedule);
        update();
        return () => {
            cancelAnimationFrame(frame);
            sizes.disconnect();
            window.removeEventListener("scroll", schedule, true);
            window.removeEventListener("resize", schedule);
            phone.removeEventListener("change", schedule);
            window.visualViewport?.removeEventListener("resize", schedule);
            window.visualViewport?.removeEventListener("scroll", schedule);
        };
    }, []);

    return (
        <div className="aix-registration-lock" ref={lockRef}>
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
