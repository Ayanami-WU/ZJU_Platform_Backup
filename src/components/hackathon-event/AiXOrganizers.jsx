import "./AiXOrganizers.css";

const logos = {
    innovation: "/images/hackathon/ai-x/organizers/zhejiang-university-white.png",
    tuozhe: "/images/brand/logo-mark-transparent.png",
    "qiushi-eagle": "/images/hackathon/ai-x/organizers/qiushi-eagle.png",
    "elite-eagle": "/images/partner-logos/organizations/official/elite-eagle.png",
};

export default function AiXOrganizers({ groups }) {
    return (
        <dl className="aix-organizers">
            {groups.map((group) => (
                <div className="aix-organizers-group" key={group.label}>
                    <dt>{group.label}</dt>
                    <dd>
                        <ul>
                            {group.members.map((member) => (
                                <li key={member.id} data-organizer={member.id}>
                                    <span className="aix-organizer-logo">
                                        <img
                                            src={logos[member.id]}
                                            alt={member.id === "elite-eagle" ? member.name : ""}
                                            loading="lazy"
                                        />
                                    </span>
                                    {member.id !== "elite-eagle" && <span>{member.name}</span>}
                                </li>
                            ))}
                        </ul>
                    </dd>
                </div>
            ))}
        </dl>
    );
}
