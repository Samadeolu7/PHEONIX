# App 3: Bank Feed and Automated Reconciliation Service

**Application Name:** `phoenix-bankfeed-svc`  
**Technology:** Spring Boot 3.x + Spring Integration + Spring Data JPA + Resilience4j  
**Runtime Profile:** Scheduled service — runs a nightly reconciliation job at 1:00 AM WAT, matches transactions against GL, pre-populates reconciliation screen; always-running for health checks  
**Deployment:** Docker container, persistent service (not a job), restarts automatically on failure

---

## What This App Solves

`cash_management/models.py` has a complete `BankReconciliation` model with an approve/reject/submit
workflow, reconciling items stored as JSON (deposits in transit, outstanding checks, bank charges),
and a `bank_statement` FileField accepting PDF uploads. Every single reconciling item in that JSON
is typed in by hand. There is no parser, no bank API connection, and no matching engine.

`banks/BANK_MANAGEMENT_GUIDE.md` explicitly lists as a planned feature:
*"Bank statement import — Automatic reconciliation from CSV/Excel."*

The `BankAccount` model has `daily_withdrawal_limit`, `monthly_transaction_limit`, and
`requires_dual_approval` configured — but no live bank connection enforces any of these
limits in real time. The limit exists in the ERP but the bank does not know about it,
and the ERP does not know what the bank has actually cleared.

The CBN Open Banking Framework (2023) mandates that licensed banks expose standardised APIs
for account data access. Rather than integrating directly with 5+ bank APIs (each requiring
separate OAuth flows, sandbox approval processes, and diverging response formats), this service
uses **Mono** (withmono.com) as a unified bank data aggregator. Mono normalises transaction
data from GTBank, Zenith, Access, First Bank, UBA and others into a single API with one
set of credentials. The service pulls transactions once per night at 1:00 AM WAT, runs the
matching engine, and pre-populates the reconciliation screen before staff arrive in the morning.
The time saving from manual reconciliation is the same as real-time — the gap only matters
if the client needs intraday cash positioning, which small clients typically do not.

---

## When to Start Building This (Django Migration Trigger Points)

**You are ready to build this when:**

1. A client is reconciling more than 3 bank accounts monthly — manual reconciliation at that
   scale takes a finance staff member 2–3 full days per month
2. A discrepancy between the GL and the actual bank balance is discovered more than a week
   after it occurred — this has happened already if the client is live
3. The client asks for a real-time cash position dashboard — you cannot build that without
   live bank balance feeds
4. You are onboarding a client in the school, cooperative, or savings-and-loans sector —
   these clients have very high transaction volumes that make manual reconciliation impractical

**What to change in Django before cutting over:**

1. Create a `bank_feed` schema in the same PostgreSQL instance (owned by the Java app):
   ```sql
   CREATE SCHEMA bank_feed;
   GRANT USAGE ON SCHEMA bank_feed TO phoenix_app;    -- Django can SELECT from it
   GRANT ALL ON SCHEMA bank_feed TO bankfeed_svc;     -- Java service owns it
   ```

2. Add a `BankFeedConsent` model to Django's `banks` app:
   ```python
   class BankFeedConsent(models.Model):
       bank_account = models.OneToOneField(BankAccount, on_delete=models.CASCADE)
       consent_reference = models.CharField(max_length=255)   # From bank's consent API
       consented_at = models.DateTimeField()
       expires_at = models.DateTimeField()
       scope = models.CharField(max_length=100)               # e.g. 'account:read transactions:read'
       is_active = models.BooleanField(default=True)
   ```
   The Java service checks this before polling any account. No consent record → no polling.

3. Add a Django endpoint for the pre-populated reconciliation view:
   ```
   GET /api/cash-management/bank-reconciliation/{id}/pre-populated/
   ```
   This joins Django's `BankReconciliation` with `bank_feed.transactions` for the same
   account/period and returns matched + unmatched items for the frontend to display.

4. Add `feed_connected` boolean and `last_feed_at` DateTimeField to `BankAccount` in Django.
   The frontend shows "Live feed active" / "Manual only" based on this.

5. Add the internal write-back endpoint:
   ```
   POST /api/internal/bank-feed/pre-populate-reconciliation/
   ```
   Java calls this to suggest reconciling items. Django merges them into the JSON field
   on the relevant `BankReconciliation` record.

**After cutover, the Django reconciliation UI should:**
- Show a "Bank Feed" tab on `BankReconciliation` detail page with live transactions
- Auto-populate `reconciling_items` from the feed before the user opens the reconciliation
- Show an `Auto-matched` badge on each item the engine matched with high confidence
- Show an `Exception` badge on unmatched bank transactions for manual resolution
- Never remove the manual entry option — the feed supplements it, does not replace it

---

## Project Structure

```
phoenix-bankfeed-svc/
├── src/
│   └── main/
│       └── java/com/phoenix/bankfeed/
│           ├── BankFeedApplication.java
│           ├── config/
│           │   ├── DataSourceConfig.java               # Dual datasource: bank_feed schema + ERP read
│           │   └── SecurityConfig.java
│           ├── domain/
│           │   ├── BankTransaction.java                # JPA entity in bank_feed.transactions
│           │   ├── GlEntry.java                        # Read-only from ERP GL tables
│           │   ├── MatchResult.java                    # Output of the matching engine
│           │   ├── MatchConfidence.java                # Enum: HIGH, MEDIUM, LOW, NONE
│           │   └── BankConnectorConfig.java            # JPA: per-account API credentials
│           ├── connector/
│           │   └── MonoConnector.java                  # Single Mono API connector — replaces 6 direct bank connectors
│           ├── polling/
│           │   ├── NightlyReconciliationJob.java       # Nightly cron at 1:00 AM WAT — pulls, stores, triggers matching
│           │   └── PullCursorRepository.java           # JPA: last-fetched date cursor per account
│           ├── matching/
│           │   ├── TransactionMatcher.java             # Orchestrates all matching strategies
│           │   ├── ExactAmountDateMatcher.java         # Amount + date exact match
│           │   ├── FuzzyReferenceMatcher.java          # Reference string similarity
│           │   ├── ToleranceMatcher.java               # Amount within fee tolerance
│           │   ├── MatchScorer.java                    # Weights strategies into a confidence score
│           │   └── MatchResult.java
│           ├── repository/
│           │   ├── BankTransactionRepository.java
│           │   └── GlEntryRepository.java              # Read-only from ERP schema
│           ├── writeback/
│           │   ├── DjangoReconciliationClient.java     # Posts matches back to Django
│           │   └── PrePopulationRequest.java           # DTO for the write-back
│           ├── consent/
│           │   └── ConsentVerificationService.java     # Checks Django for active consent before polling
│           └── monitoring/
│               ├── FeedHealthEndpoint.java
│               └── PollingMetrics.java
├── src/
│   └── main/
│       └── resources/
│           ├── application.yml
│           ├── application-prod.yml
│           └── matching-config.yml                     # Tolerance rules — externalised
├── src/
│   └── main/
│       └── resources/
│           └── db/migration/                           # Flyway migrations for bank_feed schema
│               ├── V1__create_bank_transactions.sql
│               ├── V2__create_pull_cursors.sql
│               └── V3__create_connector_configs.sql
├── src/test/
│   └── java/com/phoenix/bankfeed/
│       ├── matching/
│       │   ├── ExactAmountDateMatcherTest.java
│       │   ├── FuzzyReferenceMatcherTest.java
│       │   └── TransactionMatcherIntegrationTest.java
│       └── connector/
│           └── ConnectorContractTest.java              # Contract test against bank sandbox
├── docker/
│   └── Dockerfile
├── pom.xml
└── README.md
```

---

## Step-by-Step Implementation

### Step 1: Project Scaffolding

```xml
<dependencies>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <!-- RestTemplate for Mono API calls and Django write-back -->
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
  </dependency>
  <dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
    <!-- [Flyway manages the bank_feed schema migrations.
         Never let Spring's auto DDL create these tables — you need full control
         over column types, indexes, and constraints.
         The bank_ref UNIQUE index is what prevents duplicate transactions.
         If you let Hibernate create it, it may create a non-unique index.] -->
  </dependency>
  <dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-text</artifactId>
    <!-- For Levenshtein distance in fuzzy reference matching -->
  </dependency>
  <!-- [No Resilience4j per-bank circuit breakers needed.
       Mono handles bank API resilience on their end — if GTBank is down,
       Mono buffers and retries internally. Your connector only talks to one API: Mono.
       Standard Spring @Retryable on the Mono connector call is sufficient.]
  -->
</dependencies>
```

---

### Step 2: The Bank Transaction Schema (Flyway)

```sql
-- V1__create_bank_transactions.sql
CREATE SCHEMA IF NOT EXISTS bank_feed;

CREATE TABLE bank_feed.transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id INTEGER NOT NULL,          -- FK to banks_bankaccount.id (not enforced at DB level)
    value_date      DATE NOT NULL,
    posting_date    DATE NOT NULL,
    amount          NUMERIC(18, 2) NOT NULL,
    direction       CHAR(2) NOT NULL CHECK (direction IN ('DR', 'CR')),
    reference       VARCHAR(500),
    narration       TEXT,
    bank_ref        VARCHAR(500) NOT NULL,     -- The bank's own transaction ID
    balance_after   NUMERIC(18, 2),           -- Running balance from bank (for verification)
    
    -- Matching state
    matched             BOOLEAN NOT NULL DEFAULT FALSE,
    match_confidence    VARCHAR(10),           -- HIGH, MEDIUM, LOW
    matched_gl_entry_id INTEGER,              -- ID in transactions_transactionentry
    matched_at          TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- [Unique on bank_ref + bank_account_id.
    --  The bank_ref alone may not be globally unique across banks.
    --  A GTBank ref '000123' and a Zenith ref '000123' are different transactions.]
    CONSTRAINT uq_bank_transaction UNIQUE (bank_account_id, bank_ref)
);

CREATE INDEX idx_bank_tx_account_date ON bank_feed.transactions (bank_account_id, value_date);
CREATE INDEX idx_bank_tx_unmatched ON bank_feed.transactions (bank_account_id, matched)
    WHERE matched = FALSE;    -- Partial index — only unmatched rows, much smaller scan

-- Pull cursor table — tracks where we left off per account
CREATE TABLE bank_feed.pull_cursors (
    bank_account_id     INTEGER PRIMARY KEY,
    last_bank_ref       VARCHAR(500),
    last_value_date     DATE,
    last_pulled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consecutive_failures INTEGER NOT NULL DEFAULT 0
);
```

---

### Step 3: The Mono Connector

```java
// MonoConnector.java
@Component
public class MonoConnector {

    private final RestTemplate restTemplate;
    private final String monoBaseUrl = "https://api.withmono.com/v2";
    private final String monoSecretKey;  // From env: MONO_SECRET_KEY (never in application.yml)

    // [Mono uses a single API key (your secret key from the Mono dashboard).
    //  No per-bank OAuth tokens, no subscription keys, no token refresh logic.
    //  This replaces GtbankConnector, ZenithConnector, AccessBankConnector, etc.
    //  Before building: link a test bank account through Mono's sandbox at app.mono.co.
    //  Pull real transactions and inspect the narration quality BEFORE writing
    //  FuzzyReferenceMatcher thresholds — narration quality varies by bank.]

    @Retryable(retryFor = RestClientException.class, maxAttempts = 3,
               backoff = @Backoff(delay = 5000, multiplier = 2))
    public List<RawBankTransaction> pullTransactions(String monoAccountId,
                                                      LocalDate fromDate,
                                                      LocalDate toDate) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("mono-sec-key", monoSecretKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        String url = monoBaseUrl + "/accounts/{id}/transactions?start={start}&end={end}&paginate=false";
        ResponseEntity<MonoTransactionResponse> response = restTemplate.exchange(
            url, HttpMethod.GET,
            new HttpEntity<>(headers),
            MonoTransactionResponse.class,
            monoAccountId,
            fromDate.format(DateTimeFormatter.ofPattern("dd-MM-yyyy")),
            toDate.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"))
        );

        return response.getBody().getData().stream()
            .map(this::toRawTransaction)
            .collect(Collectors.toList());
    }

    private RawBankTransaction toRawTransaction(MonoTransaction t) {
        return RawBankTransaction.builder()
            .bankRef(t.getId())              // Mono transaction ID — stable, use as dedup key
            .amount(new BigDecimal(t.getAmount()).divide(BigDecimal.valueOf(100), 2, ROUND_HALF_UP))
            // [CRITICAL: Mono returns amounts in KOBO (smallest naira unit).
            //  Divide by 100. A ₦50,000 credit arrives as 5000000 in the JSON.
            //  This is the most common silent bug in Mono integrations — your DB will show
            //  ₦500.00 for a ₦50,000 transaction and matching will fail on every entry.]
            .direction("debit".equals(t.getType()) ? "DR" : "CR")
            .narration(t.getNarration())
            .valueDate(LocalDate.parse(t.getDate(), DateTimeFormatter.ofPattern("yyyy-MM-dd")))
            .build();
    }

    public BigDecimal fetchCurrentBalance(String monoAccountId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("mono-sec-key", monoSecretKey);
        ResponseEntity<MonoAccountResponse> response = restTemplate.exchange(
            monoBaseUrl + "/accounts/{id}", HttpMethod.GET,
            new HttpEntity<>(headers), MonoAccountResponse.class, monoAccountId
        );
        // Balance also in kobo — divide by 100
        return new BigDecimal(response.getBody().getData().getBalance())
            .divide(BigDecimal.valueOf(100), 2, ROUND_HALF_UP);
    }
}
```

---

### Step 4: The Mono Account Linking Model

Mono requires an account to be linked before transactions can be pulled. The Django `BankFeedConsent`
model stores the Mono account ID returned after the user completes the Mono Connect flow.

```python
# banks/models.py (add to BankFeedConsent)
class BankFeedConsent(models.Model):
    bank_account = models.OneToOneField(BankAccount, on_delete=models.CASCADE)
    mono_account_id = models.CharField(max_length=255)     # ID from Mono's /accounts endpoint
    consent_reference = models.CharField(max_length=255)   # Code from Mono Connect webhook
    consented_at = models.DateTimeField()
    expires_at = models.DateTimeField()                     # Mono reauth required after this
    is_active = models.BooleanField(default=True)
    # [mono_account_id is what the Java service uses to pull transactions.
    #  It is returned by Mono's /account/auth endpoint after you exchange the
    #  auth code received in the Connect webhook. Store it on first link, reuse thereafter.
    #  The Java service reads this via ConsentVerificationService before every nightly pull.]
```

---

### Step 5: The Nightly Reconciliation Job

```java
// NightlyReconciliationJob.java
@Component
public class NightlyReconciliationJob {

    private final MonoConnector monoConnector;
    private final ConsentVerificationService consentService;
    private final BankTransactionRepository bankTxRepository;
    private final PullCursorRepository cursorRepository;
    private final TransactionMatcher matcher;
    private final DjangoReconciliationClient djangoClient;

    // [Run at 1:00 AM Nigerian time — after end-of-day bank processing is complete.
    //  Most Nigerian bank transactions settle by midnight. Pulling at 1 AM gives you
    //  a complete picture of the previous business day before staff arrive.
    //  Sequential execution across accounts is fine at small scale (≤3 accounts).
    //  If a client scales to 10+ accounts, extract to a thread pool.]
    @Scheduled(cron = "0 0 1 * * ?", zone = "Africa/Lagos")
    public void run() {
        log.info("Nightly reconciliation job started");
        List<ConnectedAccount> accounts = consentService.fetchAllActiveAccounts();

        for (ConnectedAccount account : accounts) {
            String jobId = UUID.randomUUID().toString();
            try {
                pullAndMatchForAccount(account, jobId);
            } catch (Exception e) {
                // [Catch per-account so one failed account doesn't skip the rest.
                //  Log the job ID — it links to the full trace in structured logs.]
                log.error("[{}] Nightly pull failed for account {}: {}",
                    jobId, account.getBankAccountId(), e.getMessage(), e);
                cursorRepository.incrementFailureCount(account.getBankAccountId());
            }
        }
        log.info("Nightly reconciliation job completed for {} accounts", accounts.size());
    }

    private void pullAndMatchForAccount(ConnectedAccount account, String jobId) {
        PullCursor cursor = cursorRepository.findById(account.getBankAccountId())
            .orElseGet(() -> new PullCursor(account.getBankAccountId()));

        LocalDate fromDate = cursor.getLastValueDate() != null
            ? cursor.getLastValueDate()
            : LocalDate.now().minusDays(30);  // First run: backfill 30 days
        LocalDate toDate = LocalDate.now(ZoneId.of("Africa/Lagos")).minusDays(1); // Yesterday's data

        log.info("[{}] Pulling transactions for account {} from {} to {}",
            jobId, account.getBankAccountId(), fromDate, toDate);

        List<RawBankTransaction> raw = monoConnector.pullTransactions(
            account.getMonoAccountId(), fromDate, toDate);

        // Save transactions first, THEN advance cursor — never advance on pull failure
        List<BankTransaction> saved = saveNewTransactions(raw, account.getBankAccountId());
        if (!saved.isEmpty()) {
            cursor.setLastValueDate(toDate);
            cursor.setLastPulledAt(Instant.now());
            cursor.resetFailureCount();
            cursorRepository.save(cursor);
        }

        // Run matching inline — acceptable latency for daily job
        saved.forEach(matcher::matchSingle);

        // Post balance update to Django
        BigDecimal balance = monoConnector.fetchCurrentBalance(account.getMonoAccountId());
        djangoClient.postBalanceUpdate(account.getBankAccountId(), balance, Instant.now());

        log.info("[{}] Pulled {} transactions, saved {} new, balance ₦{}",
            jobId, raw.size(), saved.size(), balance);
    }
}
```

---

### Step 6: The Matching Engine

This is the most important and most interview-worthy component. Design it as a pipeline
of independent matchers that each produce a partial score, combined into a confidence level.

```java
// TransactionMatcher.java
@Service
public class TransactionMatcher {

    private final ExactAmountDateMatcher exactMatcher;
    private final FuzzyReferenceMatcher referenceMatcher;
    private final ToleranceMatcher toleranceMatcher;
    private final MatchScorer scorer;
    private final GlEntryRepository glRepository;
    private final BankTransactionRepository bankTxRepository;

    // [Run the matcher as a scheduled job, NOT synchronously during the poll.
    //  Separating the pull from the matching means:
    //  - A slow matching run (many unmatched items) does not delay the next bank poll
    //  - You can re-run matching independently (e.g. after adding a new matching rule)
    //    without re-polling the bank
    //  - Matching failures do not cause pull failures — the raw transaction is always saved first]
    @Scheduled(fixedDelay = 3600000)  // Every hour
    public void matchPendingTransactions() {
        List<BankTransaction> unmatched = bankTxRepository.findUnmatched();
        for (BankTransaction tx : unmatched) {
            matchSingle(tx);
        }
    }

    private void matchSingle(BankTransaction bankTx) {
        // Candidate GL entries: same account, date within tolerance, same direction
        LocalDate windowStart = bankTx.getValueDate().minusDays(3);
        LocalDate windowEnd = bankTx.getValueDate().plusDays(3);
        // [3-day date window is standard in Nigerian banking:
        //  value date and posting date frequently differ by 1-2 days,
        //  and RTGS/NIP settlements can take up to T+1. A tighter window misses real matches.
        //  A wider window (7+ days) produces too many false candidates and slows down matching.]
        List<GlEntry> candidates = glRepository.findCandidates(
            bankTx.getBankAccountId(), bankTx.getDirection(),
            bankTx.getAmount(), windowStart, windowEnd
        );

        if (candidates.isEmpty()) return;  // No candidates — stays unmatched for human review

        MatchResult best = candidates.stream()
            .map(gl -> scorer.score(bankTx, gl))
            .max(Comparator.comparing(MatchResult::getScore))
            .orElse(null);

        if (best == null) return;

        if (best.getConfidence() == MatchConfidence.HIGH) {
            // Auto-match without human confirmation
            applyMatch(bankTx, best.getGlEntry(), MatchConfidence.HIGH);
        } else if (best.getConfidence() == MatchConfidence.MEDIUM) {
            // [Queue for human confirmation — do not auto-match MEDIUM confidence.
            //  A MEDIUM match where you are wrong will produce a reconciliation that
            //  appears complete but has two wrong line items cancelling each other out.
            //  An auditor will find this. A human review of 10 ambiguous items per month
            //  is far cheaper than explaining a misstatement to an external auditor.]
            queueForHumanReview(bankTx, best);
        }
        // LOW and NONE: leave as unmatched exception — no action
    }
}
```

```java
// ExactAmountDateMatcher.java
public class ExactAmountDateMatcher {

    public int score(BankTransaction bankTx, GlEntry gl) {
        boolean amountMatch = bankTx.getAmount().compareTo(gl.getAmount()) == 0;
        boolean dateMatch = !bankTx.getValueDate().isBefore(gl.getPostingDate().minusDays(1))
                         && !bankTx.getValueDate().isAfter(gl.getPostingDate().plusDays(1));
        // [amount.compareTo() not amount.equals() — BigDecimal.equals() also compares scale.
        //  100.00.equals(100.0) is FALSE in BigDecimal. compareTo returns 0 for equal values
        //  regardless of scale. This is a well-known trap that breaks matching silently.]
        if (amountMatch && dateMatch) return 100;
        if (amountMatch) return 60;
        return 0;
    }
}
```

```java
// FuzzyReferenceMatcher.java
public class FuzzyReferenceMatcher {

    // [Levenshtein distance on transaction references.
    //  Bank narrations are truncated, sometimes re-ordered, sometimes abbreviated.
    //  "PHEONIX TECH CONSULT / INV-2026-001 / PETER" in the ERP may appear as
    //  "PHEONIX TECH/PETER ADEMOYE" in the bank statement.
    //  Levenshtein distance of <= 20% of the longer string length = likely same transaction.]

    public int score(String bankNarration, String glNarration) {
        if (bankNarration == null || glNarration == null) return 0;
        int distance = StringUtils.getLevenshteinDistance(
            bankNarration.toUpperCase(), glNarration.toUpperCase()
        );
        int maxLen = Math.max(bankNarration.length(), glNarration.length());
        double similarity = 1.0 - ((double) distance / maxLen);
        if (similarity >= 0.85) return 40;
        if (similarity >= 0.70) return 20;
        return 0;
    }
}
```

```yaml
# matching-config.yml
# [Externalise thresholds so they can be tuned without redeployment.
#  After go-live with a real client, you will find that some banks produce narrations
#  that match poorly and others match perfectly. You need to raise thresholds per-bank
#  without recompiling and redeploying the service.]
matching:
  date_window_days: 3
  high_confidence_threshold: 90      # Score >= 90: auto-match
  medium_confidence_threshold: 55    # Score 55–89: queue for human review
  fee_tolerance_naira: 500.00        # Bank charges within 500 NGN of GL amount count as match
  reference_similarity_floor: 0.70
```

---

### Step 7: Writing Pre-Populated Matches Back to Django

```java
// DjangoReconciliationClient.java
@Component
public class DjangoReconciliationClient {

    // [Post pre-populated items to Django every time a new HIGH confidence match is found.
    //  Do NOT batch these up and post once a day — the user should see real-time reconciliation
    //  status as soon as a match is confirmed. The frontend should refresh the reconciliation
    //  view periodically and show newly auto-matched items with a green badge.]

    @Retryable(retryFor = RestClientException.class, maxAttempts = 5,
               backoff = @Backoff(delay = 2000, multiplier = 2))
    public void postPrePopulatedItem(Long bankReconciliationId,
                                      MatchResult match,
                                      BankTransaction bankTx) {
        PrePopulationRequest request = PrePopulationRequest.builder()
            .bankReconciliationId(bankReconciliationId)
            .bankTransactionId(bankTx.getId().toString())
            .bankRef(bankTx.getBankRef())
            .glEntryId(match.getGlEntry().getId())
            .amount(bankTx.getAmount())
            .direction(bankTx.getDirection())
            .valueDate(bankTx.getValueDate())
            .matchConfidence(match.getConfidence().name())
            .narration(bankTx.getNarration())
            .autoMatched(match.getConfidence() == MatchConfidence.HIGH)
            .build();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(serviceToken);
        restTemplate.postForEntity(
            djangoBaseUrl + "/api/internal/bank-feed/pre-populate-reconciliation/",
            new HttpEntity<>(request, headers),
            Void.class
        );
    }
}
```

---

### Step 8: Consent Management

```java
// ConsentVerificationService.java
@Service
public class ConsentVerificationService {

    private final DjangoConsentClient consentClient;

    // [Cache consent status for 5 minutes. Do not call Django on every poll cycle.
    //  If Django is temporarily unavailable, use the cached consent status rather than
    //  blocking all polling. A 5-minute stale consent check is an acceptable tradeoff
    //  against making the bank feed depend on Django's uptime for every poll cycle.]
    @Cacheable(value = "consentStatus", key = "#bankAccountId")
    public boolean isConsentActive(Integer bankAccountId) {
        try {
            ConsentStatus status = consentClient.fetchConsent(bankAccountId);
            return status.isActive() && status.getExpiresAt().isAfter(Instant.now().plus(5, ChronoUnit.MINUTES));
        } catch (Exception e) {
            log.warn("Could not verify consent for account {} — using cached value", bankAccountId, e);
            return false;  // Fail safe: if we can't verify consent, don't poll
        }
    }

    @CacheEvict(value = "consentStatus", key = "#bankAccountId")
    public void invalidateConsent(Integer bankAccountId) {
        log.info("Consent cache evicted for account {}", bankAccountId);
    }
}
```

---

### Step 9: Balance Feed

Balance is fetched at the end of each nightly job run (inside `NightlyReconciliationJob`).
The ERP shows yesterday's closing balance — not live. For small clients doing monthly
reconciliation, this is entirely sufficient. Upgrading to intraday balance polling is a
future enhancement for clients who need a live cash position dashboard.

```java
// Inside NightlyReconciliationJob.pullAndMatchForAccount()
// (Already shown in Step 5 — balance fetch is part of the nightly run, not a separate service)
BigDecimal balance = monoConnector.fetchCurrentBalance(account.getMonoAccountId());
django.Client.postBalanceUpdate(account.getBankAccountId(), balance, Instant.now());
// Django updates BankAccount.live_balance and BankAccount.last_feed_at
// Frontend shows: “Balance as of [yesterday's date]: ₦X,XXX,XXX”
```

---

### Step 10: The Django Internal API Endpoints (Changes to Django)

```python
# banks/internal_api_views.py

class BankFeedPrePopulateView(APIView):
    """
    Internal endpoint — the Java bank feed service posts pre-matched reconciling items here.
    """
    permission_classes = [IsInternalServiceToken]

    def post(self, request):
        recon_id = request.data['bank_reconciliation_id']
        match_confidence = request.data['match_confidence']
        
        reconciliation = get_object_or_404(BankReconciliation, id=recon_id)
        
        # [Never overwrite items the user has already manually confirmed.
        #  The feed should only add items the user has not yet reviewed.
        #  Overwriting a user-confirmed item with a machine-suggested one
        #  destroys the user's work and creates trust issues with the system.]
        if reconciliation.status in ('approved', 'submitted'):
            return Response({'detail': 'Reconciliation already closed'}, status=409)
        
        # Merge into the reconciling_items JSON field
        existing_items = reconciliation.reconciling_items or {}
        feed_items = existing_items.get('feed_suggested', [])
        
        new_item = {
            'bank_transaction_id': request.data['bank_transaction_id'],
            'gl_entry_id': request.data['gl_entry_id'],
            'amount': request.data['amount'],
            'direction': request.data['direction'],
            'value_date': request.data['value_date'],
            'narration': request.data['narration'],
            'confidence': match_confidence,
            'auto_matched': request.data['auto_matched'],
            'suggested_at': now().isoformat(),
        }
        
        # Deduplicate by bank_transaction_id
        feed_items = [i for i in feed_items if i['bank_transaction_id'] != new_item['bank_transaction_id']]
        feed_items.append(new_item)
        existing_items['feed_suggested'] = feed_items
        
        reconciliation.reconciling_items = existing_items
        reconciliation.save(update_fields=['reconciling_items'])
        return Response({'status': 'merged'})


class BalanceUpdateView(APIView):
    """Internal: Java service posts current bank balance per account."""
    permission_classes = [IsInternalServiceToken]

    def post(self, request):
        account_id = request.data['bank_account_id']
        balance = Decimal(request.data['balance'])
        as_at = request.data['as_at']
        
        BankAccount.objects.filter(id=account_id).update(
            live_balance=balance,
            last_feed_at=as_at,
            feed_connected=True,
        )
        return Response({'status': 'updated'})
```

---

## Completion and Compliance Checklist

### Functional
- [ ] Each bank connector tested against its sandbox environment — not just mocked in unit tests
- [ ] `bank_ref` uniqueness constraint prevents duplicate transactions across retried polls
- [ ] Cursor advances only after transactions are successfully written to `bank_feed.transactions`
      (not before — a crash between poll and write must not advance the cursor)
- [ ] HIGH confidence auto-match is written back to Django within 30 seconds of match confirmation
- [ ] MEDIUM confidence items appear in the reconciliation UI with a "Needs review" badge
- [ ] Unmatched bank transactions appear in an exception queue visible to the finance team
- [ ] Balance feed refreshes every 5 minutes and is visible in the ERP's cash position widget
- [ ] Circuit breaker per bank opens after 5 consecutive failures and closes after 30 seconds
- [ ] Polling respects CBN Fair Use: no more than 4 calls per account per hour
- [ ] Consent expiry check runs before every poll — no polling on expired or missing consent

### CBN Open Banking Compliance
- [ ] Mono handles bank-side CBN consent compliance (their responsibility as a licensed aggregator)
- [ ] Mono account consent (Django `BankFeedConsent`) exists and is active before any account is polled
- [ ] `mono_account_id` stored per account after initial Mono Connect linking flow
- [ ] Consent expiry checked and nightly job skips expired accounts
- [ ] Mono secret key stored in environment variable (`MONO_SECRET_KEY`) — never in application.yml
- [ ] All transaction pulls logged with the Django bank account ID for reconciliation audit trail

### Security
- [ ] Mono secret key never logged, not present in application.yml — loaded from environment only
- [ ] `bank_feed.transactions` table is readable by Django’s app user (SELECT only)
      but owned and writable only by `bankfeed_svc` user
- [ ] No account numbers or bank references in log lines (use masked versions: last 4 digits only)
- [ ] Service-to-service JWT has 24-hour expiry maximum

### Matching Accuracy
- [ ] Matching engine tested with real production transaction data (anonymised) — not just
      synthetic test cases. Real bank narrations are messier than any synthetic test.
- [ ] False positive rate (wrong auto-match) below 0.5% on test dataset before any production run
- [ ] MEDIUM confidence threshold tuned per-bank if needed (some banks have cleaner narrations)
- [ ] `matching-config.yml` thresholds documented with rationale — for the audit review where
      someone asks "why is this set to 90?"

### Operational
- [ ] Nightly job metrics (transactions pulled, matched, failed) exposed to Prometheus or logged structurally
- [ ] `/actuator/health` reports: last successful nightly run per account, consecutive failure count, consent status
- [ ] Flyway migrations tested on a clean database from scratch
- [ ] The service recovers after a 24-hour outage without data loss (cursor holds position, next nightly run catches up)
- [ ] Runbook: how to re-consent a Mono account, how to manually re-trigger the nightly job for a specific account

---

## Things That Will Break If You Don't Plan Them Now

**Mono sandbox access is fast.** Create an account at app.mono.co, get your test secret key, and
link a test bank account using Mono Connect. Unlike direct bank API integrations (which required
2–4 weeks of business registration approval with GTBank or Zenith), your development environment
can be pulling real-ish test data within a day. Do this before writing any matching logic —
you need to see the actual narration quality from First Bank specifically before setting
`FuzzyReferenceMatcher` thresholds.

**Mono pricing must be confirmed before client go-live.** Based on public information, daily
transaction pulls on business accounts fall into Mono's enterprise tier (~₦100–500 per API call,
~₦9k–45k/month for 3 accounts). Contact sales@mono.co with your expected call volume before
building. The infrastructure cost of the additional Docker container is zero if it runs on the
existing server.

**Mono amounts are in kobo.** `5000000` in the JSON is ₦50,000, not ₦5,000,000. Divide by 100 in
`MonoConnector.toRawTransaction()`. This is the most common Mono integration bug. If you miss it,
every transaction in the DB will be 100× the actual amount, matching will fail on everything,
and the reconciliation screen will show nonsense balances. Catch it in `TaxBandCalculationTest`
by asserting a known ₦50,000 transaction maps to `50000.00`, not `500000.00`.

**The `bank_feed` schema is a shared dependency.** If you ever need to change the `bank_feed.transactions`
table structure (add a column, change a type), you need to coordinate with the Django team —
Django reads from this schema. Add a Flyway migration, never an ad-hoc ALTER TABLE.
Treat the `bank_feed` schema with the same discipline as the ERP’s main schema.

**Mono may be unavailable during month-end peaks.** Even though Mono abstracts away individual
bank API instability, Mono’s own platform can experience delays when all Nigerian banks are
under month-end load simultaneously. Design the nightly job to log and alert on failures
without crashing — the cursor will hold its position and the next successful run catches up.
If the job fails 3 nights in a row, send an alert to the operations team.

**Matching will never be 100%.** Some transactions will always be unmatched — bank charges
with no equivalent GL entry, EFT transfers that were journalised differently, reversed entries.
The exception queue needs a UI in the ERP that is easy for a finance staff member to clear daily.
If the queue grows beyond ~30 items, it becomes a psychological barrier and staff stop reviewing
it. Design the exception queue UX as carefully as the matching engine.
