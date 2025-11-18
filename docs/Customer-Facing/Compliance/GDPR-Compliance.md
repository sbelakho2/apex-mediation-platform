# GDPR Compliance Guide

_Last updated: 2025-11-18_  
_Owner: Legal / Compliance Team_  
_Review Cycle: Quarterly (next review: 2026-02-18)_  
_Status: Requires legal review before production_

> **FIX-10 governance:** This compliance guide is informational only and does not constitute legal advice. For deployment status, see `docs/Internal/Deployment/PROJECT_STATUS.md`. Updates to GDPR regulations or platform capabilities must trigger document review.

Complete guide to GDPR compliance for ApexMediation customers operating in the European Economic Area (EEA).

## Table of Contents

1. [Overview](#overview)
2. [Your Responsibilities](#your-responsibilities)
3. [Our Responsibilities](#our-responsibilities)
4. [Data We Collect](#data-we-collect)
5. [Legal Basis for Processing](#legal-basis-for-processing)
6. [User Rights](#user-rights)
7. [Data Subject Requests](#data-subject-requests)
8. [Consent Management](#consent-management)
9. [Data Processing Agreement](#data-processing-agreement)
10. [Security Measures](#security-measures)

---

## Overview

The General Data Protection Regulation (GDPR) regulates how personal data of EU residents is collected, processed, and stored. As an ApexMediation customer, you are the **Data Controller** and we are your **Data Processor**.

### Key Definitions

**Data Controller:** You (the app publisher) - decides what data to collect and why
**Data Processor:** ApexMediation - processes data on your behalf
**Sub-processors:** Ad networks (AdMob, Meta, etc.) - process data for ad delivery
**Personal Data:** Any information relating to an identified or identifiable person
**Special Category Data:** Sensitive data (health, religion, etc.) - **we do NOT process this**

### GDPR Principles

1. **Lawfulness, fairness and transparency** - Clear about what data we collect and why
2. **Purpose limitation** - Only use data for specified purposes
3. **Data minimisation** - Only collect necessary data
4. **Accuracy** - Keep data accurate and up-to-date
5. **Storage limitation** - Don't keep data longer than necessary
6. **Integrity and confidentiality** - Secure data against unauthorized access
7. **Accountability** - Demonstrate compliance

---

## Your Responsibilities

As the **Data Controller**, you must:

### 1. Provide Privacy Policy

**Required elements:**
```markdown
# Privacy Policy

## Data We Collect
- Device identifiers (Advertising ID, Device ID)
- Location data (approximate, based on IP)
- Usage data (app interactions, session duration)
- Ad interaction data (impressions, clicks)

## How We Use Data
- Deliver personalized advertisements
- Analyze app performance
- Detect and prevent fraud

## Third Parties We Share Data With
- ApexMediation (ad mediation platform)
- Ad networks: Google AdMob, Meta Audience Network, Unity Ads, [...]
- Analytics providers: [if applicable]

## Your Rights
- Access your data
- Delete your data
- Opt-out of personalized ads
- Contact us: privacy@yourapp.com

## Data Retention
- Active users: Data retained while app installed
- Inactive users: Data deleted after 90 days

## International Transfers
Data may be transferred outside the EEA with appropriate safeguards (Standard Contractual Clauses).

## Contact
privacy@yourapp.com
[Your Company Address]
```

**Where to display:**
- App settings menu
- App store description (link)
- First app launch (optional)
- Website footer

### 2. Obtain User Consent

**When required:**
- Personalized ads (requires consent in EEA)
- Location tracking (always requires consent)
- Analytics (may require consent depending on implementation)

**Consent requirements:**
- **Freely given** - No coercion or bundling
- **Specific** - Separate consent for each purpose
- **Informed** - Clear explanation of what's consented to
- **Unambiguous** - Affirmative action (no pre-ticked boxes)
- **Withdrawable** - Easy to opt-out

**Implementation:**
```typescript
// Check if consent required (EEA users)
if (ApexMediation.IsConsentRequired()) {
    // Show consent dialog
    const consent = await showConsentDialog();

    if (consent.personalized_ads) {
        ApexMediation.SetConsent(ConsentType.PersonalizedAds, true);
    } else {
        ApexMediation.SetConsent(ConsentType.PersonalizedAds, false);
        // Non-personalized ads only
    }
}
```

### 3. Handle Data Subject Requests

**Required response time:** 30 days (extendable to 60 days if complex)

**Types of requests:**
- **Access (SAR):** Provide copy of all data
- **Deletion (Right to be Forgotten):** Delete all data
- **Rectification:** Correct inaccurate data
- **Portability:** Provide data in machine-readable format
- **Objection:** Stop processing for specific purposes

**Implementation:** Use ApexMediation API (see [Data Subject Requests](#data-subject-requests))

### 4. Appoint DPO (if required)

**Required if:**
- You're a public authority
- Your core activities involve large-scale systematic monitoring
- Your core activities involve large-scale processing of special category data

**Contact ApexMediation DPO:** dpo@apexmediation.ee (for questions about our processing)

### 5. Conduct DPIA (if required)

**Data Protection Impact Assessment required if:**
- Large-scale systematic monitoring (e.g., >1M users)
- Large-scale processing of special category data
- Automated decision-making with legal effects

**For most apps:** DPIA not required (standard ad serving is low-risk)

### 6. Report Data Breaches

**Timeline:**
- Notify supervisory authority within **72 hours** of becoming aware
- Notify affected users "without undue delay" if high risk

**Our commitment:** If we discover a breach affecting your users, we'll notify you within 24 hours.

---

## Our Responsibilities

As your **Data Processor**, ApexMediation:

### 1. Processes Data Per Instructions

We only process data as instructed by you (via SDK configuration, API calls, dashboard settings).

### 2. Maintains Security

**Technical measures:**
- Encryption in transit (TLS 1.3)
- Encryption at rest (AES-256)
- Regular security audits
- Penetration testing (quarterly)
- Access controls (role-based)

**Organizational measures:**
- Employee training (annual GDPR training)
- Background checks
- Confidentiality agreements
- Incident response plan

### 3. Assists with DSRs

We provide API endpoints to fulfill data subject requests (see [Data Subject Requests](#data-subject-requests)).

### 4. Deletes Data When Instructed

**Automatic deletion:**
- Inactive users: 90 days after last activity
- Account closure: 30 days after request

**Manual deletion:** Via API or dashboard

### 5. Notifies of Breaches

We'll notify you within **24 hours** of any breach affecting your users' data.

### 6. Maintains DPA

We provide a Data Processing Agreement (DPA) compliant with Article 28 GDPR (see [Data Processing Agreement](#data-processing-agreement)).

---

## Data We Collect

### Personal Data

**Device Identifiers:**
```json
{
  "advertising_id": "abc123-def456-ghi789",
  "device_id": "xyz987-uvw654-rst321",
  "idfa": "12345678-1234-1234-1234-123456789012", // iOS
  "gaid": "98765432-4321-4321-4321-210987654321"  // Android
}
```

**Purpose:** Ad delivery, frequency capping, fraud detection
**Legal basis:** Consent (personalized ads) or Legitimate interest (non-personalized)

**Device Information:**
```json
{
  "model": "iPhone 15 Pro",
  "os": "iOS",
  "os_version": "17.1.2",
  "screen_size": "1179x2556",
  "language": "en",
  "timezone": "Europe/Tallinn"
}
```

**Purpose:** Ad format selection, technical optimization
**Legal basis:** Legitimate interest

**Approximate Location:**
```json
{
  "country": "Estonia",
  "city": "Tallinn",
  "ip_address": "185.23.45.67"
}
```

**Purpose:** Geo-targeted ads, fraud detection
**Legal basis:** Legitimate interest
**Note:** We do NOT collect precise GPS coordinates (not personal data)

**Usage Data:**
```json
{
  "session_duration": 450,
  "impressions": 5,
  "clicks": 1,
  "app_version": "2.1.0"
}
```

**Purpose:** Performance analytics, optimization
**Legal basis:** Legitimate interest

### Non-Personal Data

**Aggregated statistics** (not tied to individual users):
- Total impressions
- Average eCPM
- Fill rates
- Geographic aggregates

**Legal basis:** Not applicable (not personal data)

### Data We Do NOT Collect

❌ Name, email, phone number
❌ Precise GPS location
❌ Health data
❌ Financial data (credit cards, bank accounts)
❌ Biometric data
❌ Genetic data
❌ Political opinions, religious beliefs
❌ Trade union membership
❌ Sexual orientation

---

## Legal Basis for Processing

### Consent

**When required:**
- Personalized ads in EEA
- Non-essential cookies
- Location tracking

**Implementation:**
```typescript
// Request consent
const consent = await requestConsent([
    'personalized_ads',
    'analytics'
]);

// Apply consent
ApexMediation.SetConsent(ConsentType.PersonalizedAds, consent.personalized_ads);
ApexMediation.SetConsent(ConsentType.Analytics, consent.analytics);
```

### Legitimate Interest

**When applicable:**
- Non-personalized ads
- Fraud detection
- Technical optimization
- Security monitoring

**Balancing test:**
```
Our Interest: Prevent fraud, ensure platform security
User Interest: Privacy, no harm from fraud detection
Result: Fraud detection processing is proportionate and necessary
```

**User rights:** Users can object (opt-out)

### Contract

**When applicable:**
- If you have Terms of Service requiring ad viewing
- Premium ad-free subscriptions

**Example:** "Free version supported by ads" in Terms of Service

---

## User Rights

### Right of Access (SAR)

**User request:** "Give me all my data"

**Response time:** 30 days
**Format:** JSON, CSV, or PDF
**Content:** All personal data we hold

**Implementation:** See [Data Subject Requests](#data-subject-requests)

### Right to Deletion

**User request:** "Delete all my data"

**Response time:** 30 days (actual deletion: immediate)
**Exceptions:** Legal obligations, fraud prevention (up to 90 days)

**What's deleted:**
- Device identifiers
- Usage history
- Ad interaction history
- All profile data

**What's retained:**
- Aggregated statistics (anonymized)
- Fraud logs (if user flagged for fraud - max 90 days)

### Right to Rectification

**User request:** "My data is inaccurate"

**Response:** Most data is automatically accurate (device reports it). If inaccurate, we correct it.

**Example:** User claims wrong location → We verify IP geolocation → Update if incorrect

### Right to Portability

**User request:** "Give me my data in machine-readable format"

**Response time:** 30 days
**Format:** JSON (machine-readable)

**Implementation:** Same API as Right of Access

### Right to Object

**User request:** "Stop using my data for personalized ads"

**Response:** Immediate opt-out
**Result:** Non-personalized ads only

**Implementation:**
```typescript
ApexMediation.SetConsent(ConsentType.PersonalizedAds, false);
```

### Right to Restrict Processing

**User request:** "Stop processing my data while you investigate my complaint"

**Response:** Processing paused (except storage)
**Duration:** Until complaint resolved

---

## Data Subject Requests

### API Endpoints

#### 1. Access Request (SAR)

```bash
POST /v1/gdpr/access
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "user_id": "user_xyz789",
  "advertising_id": "abc123-def456-ghi789",
  "format": "json"
}
```

**Response:**
```json
{
  "request_id": "req_abc123",
  "status": "completed",
  "data": {
    "user_id": "user_xyz789",
    "advertising_id": "abc123-def456-ghi789",
    "device": {
      "model": "iPhone 15 Pro",
      "os": "iOS 17.1.2"
    },
    "location": {
      "country": "Estonia",
      "city": "Tallinn"
    },
    "activity": {
      "first_seen": "2025-01-15T10:00:00Z",
      "last_seen": "2025-11-04T14:23:00Z",
      "total_sessions": 342,
      "total_impressions": 1567,
      "total_clicks": 28
    },
    "consents": {
      "personalized_ads": true,
      "analytics": true
    }
  },
  "download_url": "https://api.apexmediation.ee/downloads/sar_abc123.json",
  "expires_at": "2025-11-11T14:23:00Z"
}
```

#### 2. Deletion Request

```bash
POST /v1/gdpr/delete
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "user_id": "user_xyz789",
  "advertising_id": "abc123-def456-ghi789",
  "reason": "user_request"
}
```

**Response:**
```json
{
  "request_id": "req_def456",
  "status": "completed",
  "deleted_at": "2025-11-04T14:25:00Z",
  "records_deleted": 1567,
  "message": "All user data successfully deleted"
}
```

#### 3. Export Request (Portability)

```bash
POST /v1/gdpr/export
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "user_id": "user_xyz789",
  "advertising_id": "abc123-def456-ghi789",
  "format": "json"
}
```

**Response:** Same as Access Request

### Dashboard

**Navigate to: Dashboard → Privacy → Data Subject Requests**

**Submit request:**
1. Enter user ID or advertising ID
2. Select request type (Access / Delete / Export)
3. Click **Submit Request**
4. Download result (Access/Export) or confirm deletion

**Request history:**
```
┌──────────────┬─────────┬──────────┬──────────────┐
│ Request ID   │ Type    │ Status   │ Date         │
├──────────────┼─────────┼──────────┼──────────────┤
│ req_abc123   │ Access  │ Complete │ Nov 4, 14:23 │
│ req_def456   │ Delete  │ Complete │ Nov 4, 14:25 │
│ req_ghi789   │ Export  │ Complete │ Nov 3, 10:15 │
└──────────────┴─────────┴──────────┴──────────────┘
```

---

## Consent Management

### SDK Implementation

#### Check if Consent Required

```typescript
// Automatic geo-detection
if (ApexMediation.IsConsentRequired()) {
    // User in EEA, consent required
    showConsentDialog();
} else {
    // User outside EEA, consent not required (but good practice)
    ApexMediation.SetConsent(ConsentType.PersonalizedAds, true);
}
```

#### Show Consent Dialog

```typescript
async function showConsentDialog(): Promise<ConsentResult> {
    // Your custom UI or third-party CMP (Consent Management Platform)
    const result = await CustomConsentDialog.show({
        title: "Privacy & Ads",
        message: "We use your data to show personalized ads. You can opt-out anytime.",
        options: [
            {
                id: 'personalized_ads',
                label: 'Personalized ads',
                description: 'Ads based on your interests',
                default: false // No pre-ticked boxes!
            },
            {
                id: 'analytics',
                label: 'Analytics',
                description: 'Help us improve the app',
                default: false
            }
        ],
        buttons: ['Accept All', 'Accept Selected', 'Reject All']
    });

    return result;
}
```

#### Apply Consent

```typescript
const consent = await showConsentDialog();

ApexMediation.SetConsent(ConsentType.PersonalizedAds, consent.personalized_ads);
ApexMediation.SetConsent(ConsentType.Analytics, consent.analytics);

if (!consent.personalized_ads) {
    // Non-personalized ads only
    ApexMediation.SetNonPersonalizedAdsOnly(true);
}
```

#### Update Consent

```typescript
// User changes mind in settings
function updateConsent(newConsent: ConsentResult) {
    ApexMediation.SetConsent(ConsentType.PersonalizedAds, newConsent.personalized_ads);
    // Changes applied immediately
}
```

### Consent Management Platforms (CMPs)

**Recommended CMPs:**
- **Google UMP (User Messaging Platform)** - Free, integrates with AdMob
- **OneTrust** - Enterprise solution
- **Sourcepoint** - Comprehensive CMP
- **Quantcast Choice** - Free, IAB TCF 2.0 compliant

**ApexMediation compatibility:** We support IAB TCF 2.0 consent strings

```typescript
// Pass IAB TCF consent string
ApexMediation.SetIABConsentString("COvFyGBOvFyGBAbAAAENAPCAAAAAAAAAAAAAAAAA...");
```

### Consent Storage

**SDK stores consent locally:**
- iOS: UserDefaults
- Android: SharedPreferences
- Web: LocalStorage

**Backend tracking:** We record consent status for compliance audit trail

```json
{
  "user_id": "user_xyz789",
  "consent_personalized_ads": true,
  "consent_analytics": true,
  "consent_timestamp": "2025-11-04T14:23:00Z",
  "consent_version": "1.0",
  "consent_ip": "185.23.45.67"
}
```

---

## Data Processing Agreement

### Overview

ApexMediation provides a **Data Processing Agreement (DPA)** compliant with Article 28 GDPR.

**Download:** https://console.apexmediation.ee/legal/dpa
**Format:** PDF (fillable)
**Signature:** Electronic signature accepted

### Key Provisions

**Article 1: Subject Matter**
- Processing of personal data for ad mediation services

**Article 2: Duration**
- Duration of ApexMediation service agreement
- 30 days post-termination for data deletion

**Article 3: Nature and Purpose**
- Ad delivery
- Fraud detection
- Performance analytics

**Article 4: Types of Data**
- Device identifiers
- Usage data
- Approximate location

**Article 5: Categories of Data Subjects**
- Your app users

**Article 6: Obligations**
- Process data only per your instructions
- Ensure confidentiality
- Implement security measures
- Assist with DSRs
- Notify of breaches
- Delete data when instructed

**Article 7: Sub-Processors**
- List of sub-processors (ad networks)
- Right to object to new sub-processors (14-day notice)

**Article 8: International Transfers**
- Standard Contractual Clauses (SCCs)
- Data may be transferred outside EEA with safeguards

**Article 9: Security**
- Technical and organizational measures (see [Security Measures](#security-measures))

**Article 10: Audits**
- Annual compliance audit
- Right to audit on request (reasonable notice)

### Sub-Processors

**Current sub-processors:**
- Google AdMob (Ireland)
- Meta Audience Network (Ireland)
- Unity Ads (Denmark)
- AppLovin (US - SCCs)
- ironSource (Israel - Adequacy Decision)
- AWS (Ireland) - Hosting

**Notification:** 14 days advance notice of new sub-processors
**Objection:** Email dpo@apexmediation.ee with reasons

---

## Security Measures

### Technical Measures

**Encryption:**
- In transit: TLS 1.3
- At rest: AES-256
- Backups: Encrypted

**Access Control:**
- Role-based access (RBAC)
- Multi-factor authentication (MFA)
- Principle of least privilege
- Regular access reviews

**Network Security:**
- Firewalls
- Intrusion detection (IDS)
- DDoS protection
- VPN for remote access

**Monitoring:**
- 24/7 security monitoring
- Automated threat detection
- Security information and event management (SIEM)
- Incident response team

**Testing:**
- Quarterly penetration testing
- Annual security audit
- Vulnerability scanning (weekly)
- Bug bounty program

### Organizational Measures

**Policies:**
- Information security policy
- Data protection policy
- Incident response plan
- Business continuity plan

**Training:**
- Annual GDPR training (all employees)
- Security awareness training (quarterly)
- Phishing simulations (monthly)

**Contracts:**
- Employee confidentiality agreements
- Contractor NDAs
- Sub-processor agreements

**Physical Security:**
- Data centers: SOC 2 Type II certified
- Access control (biometric)
- 24/7 surveillance
- Environmental controls

---

## Compliance Checklist

### Before Launch

- [ ] Create privacy policy
- [ ] Implement consent dialog (EEA users)
- [ ] Test data subject request flow
- [ ] Sign DPA with ApexMediation
- [ ] Update app store privacy section
- [ ] Train team on GDPR requirements

### Ongoing

- [ ] Review privacy policy (annual)
- [ ] Monitor consent rates
- [ ] Handle DSRs within 30 days
- [ ] Update sub-processor list (if changed)
- [ ] Conduct DPIA (if required)
- [ ] Document compliance measures

---

## FAQ

### Do I need consent for non-personalized ads?

**No (in most cases).** Non-personalized ads can rely on legitimate interest. However, some interpretations of GDPR suggest consent is safer. We recommend:
- EEA: Ask for consent, offer non-personalized as alternative
- Non-EEA: No consent required

### How long do you keep data?

**Active users:** While app installed
**Inactive users:** 90 days after last activity
**Deleted users:** Immediate deletion (except fraud logs: max 90 days)

### Can users opt-out of data collection entirely?

**Yes, but:** Opting out of all data collection means we can't serve ads (ads require basic device info). Options:
1. Non-personalized ads (minimal data)
2. No ads (app must support ad-free mode)

### What if user uses VPN?

We detect VPN users and treat them as if located in their VPN exit country. If uncertain, we apply EEA standards (safest approach).

### Are you a data controller or processor?

**Data Processor.** You (app publisher) are the Data Controller.

Exception: For our own analytics (not shared with you), we're a Data Controller.

### Do you share data with third parties?

**Yes:** Ad networks need data to serve ads. All networks are GDPR-compliant and operate under DPAs.

### What about CCPA (California)?

We're CCPA-compliant too! See separate CCPA guide: [CCPA Compliance](./CCPA-Compliance.md)

---

## Support

**DPO Email:** dpo@apexmediation.ee
**Legal inquiries:** legal@apexmediation.ee
**Dashboard:** https://console.apexmediation.ee/privacy
**Documentation:** https://apexmediation.bel-consulting.ee/docs/gdpr

**Response Times:**
- GDPR questions: <48 hours
- DSR assistance: <24 hours
- Breach notifications: <24 hours
