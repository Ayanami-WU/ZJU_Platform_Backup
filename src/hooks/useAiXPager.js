import { useEffect } from "react";

// The responsive app shell can replace its route subtree at the mobile breakpoint.
// Carry scroll positions across that immediate resize remount, never across routes.
let resizeRemount = null;

// Keep overflow inside the current screen until its edge, then turn one page.
export function useAiXPager(containerRef, ids, enabled, reduceMotion) {
    useEffect(() => {
        const root = containerRef.current;
        if (!enabled || !root) return;
        let locked = false,
            timer,
            navigationTimer,
            resizeFrame,
            restoreFrame,
            touchStart;
        let resizedAt = -Infinity;
        let width = root.clientWidth,
            height = root.clientHeight;
        let activePage = null,
            navigationTarget = null;
        const nestedPositions = new Map();
        const trackNestedScroll = (event) => {
            if (event.target !== root && event.target instanceof Element)
                nestedPositions.set(event.target, event.target.scrollTop);
        };
        const sections = () => ids.map((id) => root.querySelector(`#${id}`)).filter(Boolean);
        const top = (el) =>
            el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
        const nearestPage = (pages = sections()) =>
            pages.reduce(
                (best, page) =>
                    !best ||
                    Math.abs(top(page) - root.scrollTop) < Math.abs(top(best) - root.scrollTop)
                        ? page
                        : best,
                null
            );
        const hashPage = () => {
            const id = window.location.hash.slice(1);
            return sections().find((page) => page.id === id);
        };
        const previous = resizeRemount;
        const restore =
            previous &&
            previous.url === window.location.href &&
            previous.ids === ids.join("|") &&
            performance.now() - previous.savedAt < 1000 &&
            (previous.width !== width ||
                previous.height !== height ||
                performance.now() - previous.resizedAt < 1000);
        resizeRemount = null;
        activePage =
            (restore && sections().find((page) => page.id === previous.id)) ||
            hashPage() ||
            nearestPage();
        if (restore && activePage) {
            resizedAt = performance.now();
            restoreFrame = requestAnimationFrame(() => {
                root.scrollTo({ top: top(activePage), behavior: "instant" });
                const descendants = activePage.querySelectorAll("*");
                for (const saved of previous.nested || []) {
                    const element = descendants[saved.index];
                    if (element?.tagName === saved.tag && element.className === saved.className) {
                        element.scrollTop = saved.top;
                        nestedPositions.set(element, element.scrollTop);
                    }
                }
                restoreFrame = null;
            });
        }
        const trackScroll = () => {
            // Layout can emit a scroll before ResizeObserver; don't infer a new chapter
            // from an old scroll offset against the new page heights.
            if (resizeFrame || root.clientWidth !== width || root.clientHeight !== height) return;
            if (navigationTarget) {
                if (Math.abs(top(navigationTarget) - root.scrollTop) > 2) return;
                navigationTarget = null;
                clearTimeout(navigationTimer);
            }
            activePage = nearestPage();
        };
        const rememberNavigation = (page) => {
            if (!page) return;
            activePage = navigationTarget = page;
            clearTimeout(navigationTimer);
            // Also recover if native smooth scrolling is interrupted by the user.
            navigationTimer = setTimeout(() => {
                navigationTarget = null;
                trackScroll();
            }, 900);
        };
        const chapterClick = (event) => {
            if (!(event.target instanceof Element)) return;
            const button = event.target.closest(".aix-chapters button");
            if (!button || !root.contains(button)) return;
            const index = [...button.parentElement.children].indexOf(button);
            rememberNavigation(root.querySelector(`#${ids[index]}`));
        };
        const hashChange = () => rememberNavigation(hashPage());
        const resize = () => {
            if (root.clientWidth === width && root.clientHeight === height) return;
            resizedAt = performance.now();
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
                const pages = sections();
                const page = pages.includes(activePage) ? activePage : nearestPage(pages);
                width = root.clientWidth;
                height = root.clientHeight;
                clearTimeout(timer);
                clearTimeout(navigationTimer);
                locked = false;
                touchStart = null;
                navigationTarget = null;
                activePage = page;
                // Cancel any smooth scroll that still targets the old geometry. Nested
                // scrollers are deliberately untouched, preserving reading/form position.
                if (page) root.scrollTo({ top: top(page), behavior: "instant" });
                resizeFrame = null;
            });
        };
        const observer = new ResizeObserver(resize);
        observer.observe(root);
        const nestedCanScroll = (target, direction) => {
            for (let el = target; el instanceof Element && el !== root; el = el.parentElement) {
                if (
                    /auto|scroll/.test(getComputedStyle(el).overflowY) &&
                    el.scrollHeight > el.clientHeight + 2
                ) {
                    if (
                        direction > 0
                            ? el.scrollTop + el.clientHeight < el.scrollHeight - 2
                            : el.scrollTop > 2
                    )
                        return true;
                }
            }
            return false;
        };
        const turn = (direction, target, event) => {
            if (!(target instanceof Element)) return;
            if (target.closest('input, textarea, select, [contenteditable="true"], dialog[open]'))
                return;
            if (nestedCanScroll(target, direction)) return;
            const pages = sections();
            if (!pages.length || resizeFrame) return;
            const current = pages.indexOf(nearestPage(pages));
            const next = Math.max(0, Math.min(pages.length - 1, current + direction));
            if (current === next || !pages[next]) return;
            event.preventDefault();
            if (locked) return;
            locked = true;
            rememberNavigation(pages[next]);
            root.scrollTo({ top: top(pages[next]), behavior: reduceMotion ? "instant" : "smooth" });
            clearTimeout(timer);
            timer = setTimeout(
                () => {
                    locked = false;
                },
                reduceMotion ? 180 : 800
            );
        };
        const wheel = (e) => {
            if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) > 7)
                turn(Math.sign(e.deltaY), e.target, e);
        };
        const key = (e) => {
            if (!(e.target instanceof Element)) return;
            if (
                e.target.closest(
                    'input, textarea, select, button, a, [contenteditable="true"], dialog[open]'
                )
            )
                return;
            const direction = { PageDown: 1, PageUp: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
            if (direction) turn(direction, e.target, e);
        };
        const start = (e) => {
            touchStart =
                e.touches.length === 1 ? { y: e.touches[0].clientY, target: e.target } : null;
        };
        const move = (e) => {
            if (!touchStart || e.touches.length !== 1) return;
            const delta = touchStart.y - e.touches[0].clientY;
            if (Math.abs(delta) > 45) {
                turn(Math.sign(delta), touchStart.target, e);
                touchStart = null;
            }
        };
        root.addEventListener("scroll", trackScroll, { passive: true });
        root.addEventListener("scroll", trackNestedScroll, { passive: true, capture: true });
        root.addEventListener("click", chapterClick, true);
        window.addEventListener("hashchange", hashChange);
        root.addEventListener("wheel", wheel, { passive: false });
        root.addEventListener("keydown", key);
        root.addEventListener("touchstart", start, { passive: true });
        root.addEventListener("touchmove", move, { passive: false });
        return () => {
            if (activePage) {
                const snapshot = {
                    id: activePage.id,
                    ids: ids.join("|"),
                    url: window.location.href,
                    width,
                    height,
                    resizedAt,
                    savedAt: performance.now(),
                    nested: [...activePage.querySelectorAll("*")].flatMap((element, index) => {
                        const position = nestedPositions.get(element);
                        return position > 0
                            ? [
                                  {
                                      index,
                                      tag: element.tagName,
                                      className: element.className,
                                      top: position,
                                  },
                              ]
                            : [];
                    }),
                };
                // StrictMode may clean up a restored root before the first frame.
                if (restoreFrame && !snapshot.nested.length && restore)
                    snapshot.nested = previous.nested || [];
                resizeRemount = snapshot;
                setTimeout(() => {
                    if (resizeRemount === snapshot) resizeRemount = null;
                }, 1000);
            }
            clearTimeout(timer);
            clearTimeout(navigationTimer);
            cancelAnimationFrame(resizeFrame);
            cancelAnimationFrame(restoreFrame);
            observer.disconnect();
            root.removeEventListener("scroll", trackScroll);
            root.removeEventListener("scroll", trackNestedScroll, true);
            root.removeEventListener("click", chapterClick, true);
            window.removeEventListener("hashchange", hashChange);
            root.removeEventListener("wheel", wheel);
            root.removeEventListener("keydown", key);
            root.removeEventListener("touchstart", start);
            root.removeEventListener("touchmove", move);
        };
    }, [containerRef, ids, enabled, reduceMotion]);
}
