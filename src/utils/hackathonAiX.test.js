import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
    stageState,
    currentStage,
    registrationOpen,
    resolveAiXView,
    safeWebUrl,
} from "./hackathonAiX.js";
const stages = [
    { id: "initial", opensAt: "2026-10-18T11:00:00+08:00", closesAt: "2026-10-18T17:00:00+08:00" },
    {
        id: "semifinal",
        opensAt: "2026-10-19T00:00:00+08:00",
        closesAt: "2026-10-23T00:00:00+08:00",
    },
];
test("stages use absolute China time, including between-round and deadline boundaries", () => {
    assert.equal(stageState(stages[0], Date.parse("2026-10-18T10:59:59+08:00")), "upcoming");
    assert.equal(stageState(stages[0], Date.parse("2026-10-18T03:00:00Z")), "live");
    assert.equal(stageState(stages[0], Date.parse("2026-10-18T17:00:00+08:00")), "ended");
    assert.equal(currentStage(stages, Date.parse("2026-10-18T20:00:00+08:00")).id, "semifinal");
    assert.equal(currentStage(stages, Date.parse("2026-10-25T00:00:00Z")).id, "semifinal");
});
test("registration follows event visibility, availability and cutoff", () => {
    const template = {
        navigation: { registrationVisible: true },
        event: { registrationOpen: true, program: { registrationClosesAt: stages[0].opensAt } },
    };
    assert.equal(registrationOpen(template, Date.parse("2026-10-01")), true);
    assert.equal(registrationOpen(template, Date.parse(stages[0].opensAt)), false);
    template.event.registrationOpen = false;
    assert.equal(registrationOpen(template, Date.parse("2026-10-01")), false);
});
test("legacy view aliases remain useful and external links reject executable schemes", () => {
    assert.equal(resolveAiXView("register"), "intro");
    assert.equal(resolveAiXView("showcase"), "results");
    assert.equal(safeWebUrl("javascript:alert(1)"), null);
    assert.equal(safeWebUrl("https://example.com/submit"), "https://example.com/submit");
});
test("frontend and server keep campus open while industry stays closed, including boundaries and master switches", () => {
    const serverOpen = createRequire(import.meta.url)(
        "../../server/src/services/hackathonRegistrationWindow.js"
    ).registrationOpen;
    const template = {
        navigation: { registrationVisible: true },
        event: {
            registrationOpen: true,
            endAt: "2026-10-25T16:00",
            program: {
                registrationOpensAt: "2026-10-13T00:00:00+08:00",
                registrationClosesAt: "2026-10-17T18:00:00+08:00",
                trackRegistration: {
                    campus: { enabled: true, closesAt: "2026-10-20T23:00:00+08:00" },
                    industry: { enabled: false },
                },
            },
        },
    };
    for (const open of [registrationOpen, serverOpen]) {
        const now = Date.parse("2026-10-19T12:00:00+08:00");
        assert.equal(open(template, now), true);
        assert.equal(open(template, now, "campus"), true);
        assert.equal(open(template, now, "industry"), false);
        assert.equal(open(template, Date.parse("2026-10-20T23:00:00+08:00"), "campus"), false);
        assert.equal(open(template, Date.parse("2026-10-12T23:59:59+08:00"), "campus"), false);
        template.event.program.trackRegistration.industry.enabled = true;
        assert.equal(open(template, now, "industry"), false); // Unset cutoff inherits the original deadline.
        template.event.program.trackRegistration.industry.enabled = false;
        template.event.registrationOpen = false;
        assert.equal(open(template, now, "campus"), false);
        template.event.registrationOpen = true;
        template.navigation.registrationVisible = false;
        assert.equal(open(template, now), false);
        template.navigation.registrationVisible = true;
        template.event.program.trackRegistration.campus.closesAt = "2099-01-01T00:00:00Z";
        assert.equal(open(template, Date.parse("2026-10-25T16:00:00+08:00"), "campus"), false);
        template.event.program.trackRegistration.campus.closesAt = "2026-10-20T23:00:00+08:00";
    }
});
