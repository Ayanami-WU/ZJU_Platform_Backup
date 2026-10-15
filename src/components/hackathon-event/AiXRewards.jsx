import { Gift, Medal, Trophy } from "lucide-react";
import "./AiXRewards.css";

function RewardPanel({ reward }) {
    return (
        <article className="aix-reward-panel" data-reward={reward.kind}>
            <header className="aix-reward-heading">
                {["gifts", "tokens"].includes(reward.kind) ? (
                    <Gift size={24} aria-hidden="true" />
                ) : (
                    <Trophy size={24} aria-hidden="true" />
                )}
                <h3>{reward.title}</h3>
            </header>
            <div className="aix-reward-total">
                <span>{reward.totalLabel}</span>
                <strong className="aix-reward-number">{reward.value}</strong>
            </div>
            <p>{reward.note}</p>
            <dl>
                {reward.rows.map((row) => (
                    <div key={row.label}>
                        <dt>
                            {!["gifts", "tokens"].includes(reward.kind) && (
                                <Medal size={23} strokeWidth={1.5} aria-hidden="true" />
                            )}
                            <strong>{row.label}</strong>
                            {row.count && <span>{row.count}</span>}
                        </dt>
                        <dd>
                            {row.products && (
                                <div
                                    className="aix-reward-products"
                                    data-pair={row.products.length === 2 || undefined}
                                >
                                    {row.products.map((product) => (
                                        <div key={product.name}>
                                            <strong className="aix-reward-product-name">
                                                {product.name}
                                            </strong>
                                            <span className="aix-reward-product-amounts">
                                                <strong className="aix-reward-value">
                                                    {product.value}
                                                </strong>
                                                <strong className="aix-reward-cash">
                                                    + {product.cash}
                                                </strong>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {row.lines.map((line) => (
                                <span key={line}>{line}</span>
                            ))}
                            {row.cash && <strong className="aix-reward-cash">{row.cash}</strong>}
                        </dd>
                    </div>
                ))}
            </dl>
            <footer aria-hidden={!reward.footer || undefined}>{reward.footer}</footer>
        </article>
    );
}

export default function AiXRewards({ rewards }) {
    const isTrack = (reward) => ["campus", "industry"].includes(reward.kind);
    return (
        <div className="aix-rewards-layout">
            <div className="aix-rewards-tracks">
                {rewards.filter(isTrack).map((reward) => (
                    <RewardPanel key={reward.kind} reward={reward} />
                ))}
            </div>
            <div className="aix-rewards-support">
                {rewards
                    .filter((reward) => !isTrack(reward))
                    .map((reward) => (
                        <RewardPanel key={reward.kind} reward={reward} />
                    ))}
            </div>
        </div>
    );
}
