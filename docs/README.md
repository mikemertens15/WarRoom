# Documentation

Start with the root [README](../README.md) for setup, controls, import fields and exact recommendation formulas.

| Guide | What it answers |
| --- | --- |
| [Operations](OPERATIONS.md) | How do I run draft night, move devices or recover a save? |
| [Architecture](ARCHITECTURE.md) | Where does state live, and which invariants must changes preserve? |
| [Data sources](DATA.md) | Where do projections come from, how are they scored, and how do updates work? |
| [Deployment and releases](DEPLOYMENT.md) | How do I publish, verify, roll back and record a release? |
| [Deployment record](DEPLOYMENTS.md) | Which production release was published and verified? |
| [Roadmap](ROADMAP.md) | What is implemented, and what is still needed for season management? |
| [Contributing](../CONTRIBUTING.md) | Which checks and documentation accompany a change? |
| [Release log](../CHANGELOG.md) | What changed in each application version? |

Local code maps: [domain library](../src/lib/README.md), [components](../src/components/README.md), [scripts](../scripts/README.md), [data files](../data/README.md), [tests](../tests/README.md).

Documentation describes implemented behavior unless labeled proposed. The app release number, draft save-format version and data retrieval timestamp are deliberately independent. A newer app release does not necessarily include newer football data.
