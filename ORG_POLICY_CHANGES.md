# GearFit.io Org Policy Changes

## Date: 2026-03-14

### Organization
- **Org:** gearfit.io
- **Org ID:** 81918920053
- **Customer ID:** C02ot4rav
- **Changed by:** Wolf (Antigravity) + mark.n@gearfit.io via gcloud CLI

---

### Policy 1: `iam.allowedPolicyMemberDomains` — **REMOVED**

**Previous Setting:**
```yaml
rules:
  - values:
      allowedValues:
      - C02ot4rav  # gearfit.io only
```

**Why removed:**
- Blocked `allUsers` from being added as Cloud Function invoker (needed for public APIs)
- Blocked `mark.n@dive-live.io` from accessing `viz-devops-studio` project
- Blocked cross-domain collaboration between gearfit.io and dive-live.io orgs

**Impact:** Any domain can now be added to IAM policies on gearfit.io projects.

---

### Policy 2: `iam.disableServiceAccountKeyCreation` — **REMOVED**

**Previous Setting:**
```yaml
rules:
  - enforce: true
```

**Why removed:**
- Prevented creating new service account keys
- Needed for development flexibility and new integrations

**Impact:** Service account keys can now be created for gearfit.io projects.

---

### Policies LEFT IN PLACE (6 remaining):

| Policy | Setting | Reason |
|--------|---------|--------|
| `storage.uniformBucketLevelAccess` | Default | Good security practice |
| `essentialcontacts.allowedContactDomains` | `@gearfit.io` only | Fine for notifications |
| `compute.restrictProtocolForwardingCreationForTypes` | Default | Compute security |
| `iam.automaticIamGrantsForDefaultServiceAccounts` | Enforced | Good — prevents over-privileged default SAs |
| `iam.disableServiceAccountKeyUpload` | Default | Prevents external key imports |
| `compute.setNewProjectDefaultToZonalDNSOnly` | Default | DNS config |

---

### Verification Commands
```bash
# List current org policies
gcloud org-policies list --organization=81918920053

# Check specific policy
gcloud org-policies describe <POLICY_NAME> --organization=81918920053

# Re-enable if needed
gcloud org-policies set-policy <POLICY_FILE>.yaml --organization=81918920053
```
