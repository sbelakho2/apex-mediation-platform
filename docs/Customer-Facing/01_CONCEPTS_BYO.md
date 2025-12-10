# Concepts & The BYO Model

ApexMediation operates on a **Bring-Your-Own (BYO)** model. This fundamental difference from other platforms ensures that you retain full ownership of your demand relationships and revenue.

## BYO vs. Managed Demand

| Feature | Traditional Mediation (Managed) | ApexMediation (BYO) |
| :--- | :--- | :--- |
| **Network Accounts** | Platform often owns the master account | **You own the accounts** |
| **Payment Flow** | Networks pay Platform → Platform pays You | **Networks pay You directly** |
| **Revenue Share** | Hidden margins / "Black Box" | **Transparent Mediation Fee** |
| **Data Ownership** | Platform owns the data | **You own the data** |
| **Switching Costs** | High (locked into their demand) | **Low** (portable accounts) |

## The Lifecycle

1.  **Sign Up**: You create accounts directly with ad networks (AdMob, AppLovin, Meta, etc.).
2.  **Configure**: You enter your network credentials (Zone IDs, Placement IDs) into the Apex Console.
3.  **Orchestrate**: The Apex SDK requests ads. Our backend runs a unified auction using your credentials.
4.  **Revenue**: The winning network serves the ad and pays you directly at the end of their billing cycle.
5.  **Fee**: Apex charges a small percentage of the *mediated revenue* as a service fee.

## Data Flow

### Request Path
1.  **App** initializes Apex SDK.
2.  **SDK** sends device signals and placement ID to Apex Backend.
3.  **Apex Backend** looks up your configured networks for that placement.
4.  **Apex Backend** executes a server-side auction (OpenRTB) or client-side waterfall plan.
5.  **SDK** receives the winning ad source and renders it.

### Reporting Path
1.  **SDK** tracks impressions, clicks, and revenue events.
2.  **Apex Backend** aggregates these events for analytics.
3.  **Apex Backend** pulls "official" revenue data from network APIs (e.g., AdMob API) for reconciliation.

## Cryptographic Transparency (VRA)

Trust is built into the code. ApexMediation implements **Verifiable Revenue Attribution (VRA)**.

*   **Signed Decisions**: Every auction outcome is cryptographically signed by our backend.
*   **Independent Verification**: You can use our public key to verify that the auction logic was followed correctly and that no higher-paying bid was arbitrarily suppressed.
*   **Audit Trail**: All decisions are logged in a tamper-evident ledger.

This ensures that we are acting as a neutral arbiter, not a market manipulator.
