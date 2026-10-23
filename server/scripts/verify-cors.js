const {
    getAllowedOrigins,
    hasExplicitProductionOrigins,
    isOriginAllowed,
} = require("../src/utils/cors");

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const main = () => {
    const productionEnv = {
        NODE_ENV: "production",
        FRONTEND_URL: "https://tuotuzju.com",
        CORS_ALLOWED_ORIGINS: "https://tuotuzju.com,https://www.tuotuzju.com,capacitor://localhost",
    };

    const productionOrigins = getAllowedOrigins(productionEnv);
    assert(
        productionOrigins.includes("https://tuotuzju.com"),
        "Production origin list should include the canonical domain."
    );
    assert(
        productionOrigins.includes("https://www.tuotuzju.com"),
        "Production origin list should include the www domain."
    );
    assert(
        isOriginAllowed("https://tuotuzju.com", productionOrigins),
        "Canonical domain should pass CORS validation."
    );
    assert(
        !isOriginAllowed("http://118.31.78.72", productionOrigins),
        "The retired public IP must not pass the current default CORS configuration."
    );
    assert(
        isOriginAllowed("capacitor://localhost", productionOrigins),
        "The configured iOS client should pass CORS validation."
    );
    assert(
        !isOriginAllowed("https://evil.example.com", productionOrigins),
        "Unknown third-party origins must still be rejected."
    );
    assert(
        hasExplicitProductionOrigins(productionEnv),
        "Configured production env should be recognized as explicit."
    );
    console.log("✓ Production CORS allowlist accepts the configured web and native clients.");

    const productionFallbackOrigins = getAllowedOrigins({
        NODE_ENV: "production",
    });
    assert(
        isOriginAllowed("capacitor://localhost", productionFallbackOrigins),
        "Fallback production allowlist should support the iOS Capacitor origin."
    );

    const developmentOrigins = getAllowedOrigins({
        NODE_ENV: "development",
    });
    assert(
        isOriginAllowed("http://localhost:5180", developmentOrigins),
        "Development allowlist should keep the Vite dev origin."
    );
    assert(
        isOriginAllowed("http://127.0.0.1:5180", developmentOrigins),
        "Development allowlist should accept the numeric loopback Vite origin."
    );
    assert(
        isOriginAllowed("capacitor://localhost", developmentOrigins),
        "Development allowlist should support the iOS Capacitor origin."
    );
    console.log("✓ Development CORS allowlist keeps the expected local origins.");
};

try {
    main();
} catch (error) {
    console.error("\nCORS verification failed.");
    console.error(error);
    process.exit(1);
}
