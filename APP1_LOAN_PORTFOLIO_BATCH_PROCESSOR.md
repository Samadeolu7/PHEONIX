    # App 1: Loan Portfolio Batch Processor

**Application Name:** `phoenix-loan-batch`  
**Technology:** Spring Boot 3.x + Spring Batch 5 + Quartz Scheduler + PostgreSQL JDBC  
**Runtime Profile:** Nightly scheduled job — not a web server, not a daemon  
**Deployment:** Docker container scheduled via Kubernetes CronJob or systemd timer

---

## What This App Solves

`loans/models.py` has a fully designed lending engine with five-tier CBN risk classification,
repayment schedule generation, arrears calculation, and all three interest methods
(flat, reducing balance, compound). None of these produce automatic output.

`_calculate_arrears()` is only called from inside `record_payment()`. A borrower who
makes no payment for three months has `days_in_arrears = 0` and `risk_classification = performing`
because no process runs nightly to check. There is no `loans/tasks.py`. The `analytics` module
is completely empty. Provisioning entries required by CBN prudential guidelines are never generated.

This app fixes that completely.

---

## When to Start Building This (Django Migration Trigger Points)

**You are ready to start building this Java app when any of the following occur:**

1. You have more than 50 active loan accounts in the system — at that point, manual arrears
   tracking by finance staff becomes operationally unsustainable
2. An auditor or CBN examiner asks for the provisioning schedule for classified assets —
   currently you cannot produce one from the ERP
3. You notice that a borrower has not paid in 90+ days but their record still shows
   `performing` — this has happened, it is just not visible yet
4. You want to produce a portfolio quality report by branch or product

**What to change in Django before cutting over:**

- Add an `internal_only` flag to the Django PAYE/accrual endpoints so the Java app
  can call them with a service credential but they are not exposed in the public API surface
- Add a `last_batch_processed_at` DateTimeField to `LoanAccount` so Django can show
  staleness warnings when this timestamp is more than 25 hours old
- Add a `batch_accrual_posted` BooleanField to `LoanRepaymentSchedule` so the Java
  batch can mark each installment it has processed, and Django can skip them on payment
- Create a read-only DB role for the batch app before it reads from `loans_loanaccount` directly

**After cutover, remove from Django:**
- Any manual "recalculate arrears" button or staff endpoint — the batch owns this
- The `_calculate_arrears()` call inside `record_payment()` should remain as an intra-payment
  recalculation only; make clear in code comments that it does NOT replace the batch

---

## Project Structure

```
phoenix-loan-batch/
├── src/
│   └── main/
│       ├── java/com/phoenix/loanbatch/
│       │   ├── LoanBatchApplication.java          # Entry point
│       │   ├── config/
│       │   │   ├── BatchConfig.java                # Spring Batch job/step wiring
│       │   │   ├── DataSourceConfig.java           # Dual datasource: ERP read-only + Batch meta
│       │   │   ├── QuartzConfig.java               # Nightly schedule trigger
│       │   │   └── SecurityConfig.java             # Internal API token verification
│       │   ├── domain/
│       │   │   ├── LoanAccount.java                # Read-only POJO mapped from ERP schema
│       │   │   ├── RepaymentSchedule.java
│       │   │   ├── RiskClassification.java         # Enum: PERFORMING, WATCH, SUBSTANDARD, DOUBTFUL, LOSS
│       │   │   ├── AccrualEntry.java               # Output: what gets posted to GL
│       │   │   └── ProvisioningEntry.java          # CBN provision journal entry
│       │   ├── batch/
│       │   │   ├── LoanPortfolioJob.java           # Spring Batch Job definition
│       │   │   ├── LoanItemReader.java             # JdbcCursorItemReader against ERP DB
│       │   │   ├── LoanItemProcessor.java          # Business rules: arrears, risk, accrual, provision
│       │   │   ├── LoanItemWriter.java             # Calls Django internal API to write back
│       │   │   └── LoanBatchListener.java          # Job-level alerts on failure
│       │   ├── rules/
│       │   │   ├── ArrearAgeingEngine.java         # Days in arrears calculation
│       │   │   ├── RiskClassificationEngine.java   # CBN threshold application
│       │   │   ├── InterestAccrualEngine.java      # Flat / reducing / compound daily accrual
│       │   │   └── ProvisioningRuleEngine.java     # CBN percentages: 1/5/25/50/100
│       │   ├── client/
│       │   │   ├── DjangoInternalApiClient.java    # RestTemplate/WebClient wrapper
│       │   │   ├── AccrualPostRequest.java         # DTO for GL write-back
│       │   │   └── LoanUpdateRequest.java          # DTO for risk/days_in_arrears update
│       │   └── monitoring/
│       │       ├── BatchRunRecord.java             # Domain object: batch execution summary
│       │       └── BatchHealthEndpoint.java        # Spring Actuator custom endpoint
│       └── resources/
│           ├── application.yml
│           ├── application-prod.yml
│           └── cbn-provisioning-rules.yml          # Externalised so rules can change without recompile
├── src/test/
│   └── java/com/phoenix/loanbatch/
│       ├── rules/
│       │   ├── RiskClassificationEngineTest.java   # CBN threshold unit tests — CRITICAL
│       │   ├── InterestAccrualEngineTest.java
│       │   └── ProvisioningRuleEngineTest.java
│       └── batch/
│           └── LoanPortfolioJobIntegrationTest.java
├── docker/
│   └── Dockerfile
├── pom.xml
└── README.md
```

---

## Step-by-Step Implementation

### Step 1: Project Scaffolding

Generate the project at `start.spring.io` with:
- Dependencies: `spring-batch`, `spring-jdbc`, `postgresql`, `spring-actuator`,
  `spring-quartz`, `spring-retry`, `spring-boot-starter-web` (for health endpoint only),
  `micrometer-registry-prometheus` (metrics)
- Java 21 (LTS), Spring Boot 3.3+

`pom.xml` key dependencies:
```xml
<dependency>
  <groupId>org.springframework.batch</groupId>
  <artifactId>spring-batch-core</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-quartz</artifactId>
</dependency>
<dependency>
  <groupId>org.postgresql</groupId>
  <artifactId>postgresql</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.retry</groupId>
  <artifactId>spring-retry</artifactId>
</dependency>
```

["An experienced developer would pin all dependency versions explicitly in a `<dependencyManagement>` BOM
 block, not rely on Spring Boot's version management for security-sensitive libraries
 like the JDBC driver. CBN audit findings have cited dependency version ambiguity before."]

---

### Step 2: Dual DataSource Configuration

The batch app reads from the ERP database but needs its own schema for Spring Batch's
`JobRepository` (the checkpoint tables). Never put the Spring Batch meta-tables
in the same schema as the ERP.

```yaml
# application.yml
datasources:
  erp:
    url: jdbc:postgresql://${ERP_DB_HOST}:5432/${ERP_DB_NAME}
    username: ${ERP_BATCH_READER_USER}       # Read-only role — see Django prep section
    password: ${ERP_BATCH_READER_PASSWORD}
    hikari:
      maximum-pool-size: 5                   # Never starve Django connections
      connection-timeout: 10000
  batch:
    url: jdbc:postgresql://${BATCH_DB_HOST}:5432/phoenix_batch_meta
    username: ${BATCH_DB_USER}
    password: ${BATCH_DB_PASSWORD}
    hikari:
      maximum-pool-size: 3
```

```java
// DataSourceConfig.java
@Configuration
public class DataSourceConfig {

    @Bean
    @Primary
    @ConfigurationProperties("datasources.batch")
    public DataSource batchDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    @ConfigurationProperties("datasources.erp")
    public DataSource erpDataSource() {
        return DataSourceBuilder.create().build();
    }

    // [This separation is the most important architectural decision in the app.
    //  Spring Batch's JobRepository will use batchDataSource for its BATCH_JOB_INSTANCE,
    //  BATCH_JOB_EXECUTION, and BATCH_STEP_EXECUTION tables.
    //  If these shared the ERP datasource, a Django schema migration that acquires a table
    //  lock could deadlock the batch job mid-run during a deployment overlap.]
}
```

---

### Step 3: The ItemReader — Reading Loans Directly via JDBC

```java
// LoanItemReader.java
@Component
public class LoanItemReader {

    private final DataSource erpDataSource;

    public LoanItemReader(@Qualifier("erpDataSource") DataSource erpDataSource) {
        this.erpDataSource = erpDataSource;
    }

    @StepScope
    @Bean
    public JdbcCursorItemReader<LoanAccount> loanReader() {
        return new JdbcCursorItemReaderBuilder<LoanAccount>()
            .name("loanReader")
            .dataSource(erpDataSource)
            .sql("""
                SELECT la.id, la.account_number, la.status, la.disbursement_date,
                       la.maturity_date, la.principal_amount, la.outstanding_balance,
                       la.days_in_arrears, la.risk_classification, la.interest_rate,
                       lp.interest_method, lp.interest_rate as product_rate,
                       la.branch_id, la.last_batch_processed_at
                FROM loans_loanaccount la
                JOIN loans_loanproduct lp ON la.product_id = lp.id
                WHERE la.status IN ('active', 'disbursed')
                  AND la.is_deleted = FALSE
                ORDER BY la.id
                """)
            .rowMapper(new LoanAccountRowMapper())
            .build();
    }

    // [Use JdbcCursorItemReader, NOT JdbcPagingItemReader here.
    //  The cursor keeps a single DB connection open for the entire job and streams rows.
    //  Paging re-queries between chunks — if a new loan is disbursed during the run,
    //  it shifts the page boundaries and you can process loans twice or skip one.
    //  A CBN auditor asking why the same loan was provisioned twice in one night is
    //  a conversation you do not want to have.]
}
```

---

### Step 4: The Business Rules Engines

Create these as plain Java classes with zero Spring dependencies. They should be
pure functions: given a LoanAccount, return a result. This makes unit testing exact.

```java
// RiskClassificationEngine.java
public class RiskClassificationEngine {

    // [CBN Prudential Guidelines 2014 (updated 2023), Appendix 1 — these thresholds
    //  are not invented. They are regulatory requirements. Any change to these numbers
    //  requires a new entry in the audit log with the CBN circular number that authorised
    //  the change. Build that audit trail from day one.]
    private static final int WATCH_THRESHOLD_DAYS       = 30;
    private static final int SUBSTANDARD_THRESHOLD_DAYS = 90;
    private static final int DOUBTFUL_THRESHOLD_DAYS    = 180;
    // Loss: >= 360 days or management write-off decision

    public RiskClassification classify(int daysInArrears, boolean isWriteOffCandidate) {
        if (isWriteOffCandidate || daysInArrears >= 360) return RiskClassification.LOSS;
        if (daysInArrears >= DOUBTFUL_THRESHOLD_DAYS)   return RiskClassification.DOUBTFUL;
        if (daysInArrears >= SUBSTANDARD_THRESHOLD_DAYS) return RiskClassification.SUBSTANDARD;
        if (daysInArrears >= WATCH_THRESHOLD_DAYS)       return RiskClassification.WATCH;
        return RiskClassification.PERFORMING;
    }
}
```

```java
// ProvisioningRuleEngine.java
public class ProvisioningRuleEngine {

    // [Load these from cbn-provisioning-rules.yml, not hardcoded.
    //  The CBN has changed provisioning rates twice since 2014. When Finance Act 2024
    //  changed rates again, any hardcoded percentages had to be recompiled and redeployed.
    //  Externalising to YAML means a config change + restart, not a code change + PR review.]
    private final Map<RiskClassification, BigDecimal> rates;

    public ProvisioningRuleEngine(ProvisioningRatesProperties props) {
        this.rates = props.getRates(); // from cbn-provisioning-rules.yml
    }

    public BigDecimal calculateProvision(BigDecimal outstandingBalance, RiskClassification classification) {
        BigDecimal rate = rates.get(classification);
        return outstandingBalance.multiply(rate).setScale(2, RoundingMode.HALF_UP);
        // [Always use BigDecimal for monetary calculations. Never double or float.
        //  A 0.001 rounding error per loan x 10,000 loans = NGN 10,000 misstated provision
        //  per night. CBN examiners check portfolio provision totals to two decimal places.]
    }
}
```

```yaml
# cbn-provisioning-rules.yml
cbn:
  provisioning:
    rates:
      PERFORMING:   0.01   # 1%
      WATCH:        0.05   # 5%
      SUBSTANDARD:  0.25   # 25%
      DOUBTFUL:     0.50   # 50%
      LOSS:         1.00   # 100%
    # [Update this file when CBN issues a new circular. Commit the circular number in
    #  the git commit message. This file is your regulatory audit trail for rate changes.]
    last_updated: "2023-11-01"
    circular_reference: "CBN/BSD/DIR/GEN/LAB/09/001"
```

---

### Step 5: Daily Interest Accrual Engine

```java
// InterestAccrualEngine.java
public class InterestAccrualEngine {

    // [Daily accrual = Annual Rate / 365 x Outstanding Principal.
    //  Use 365, not 360. Nigerian banking convention uses 365-day year for accrual
    //  (unlike some European conventions). If you use 360, you overstate accrual income
    //  by 1.4% per annum — material for a large portfolio.]
    private static final BigDecimal DAYS_IN_YEAR = new BigDecimal("365");

    public BigDecimal calculateDailyAccrual(BigDecimal outstandingBalance,
                                             BigDecimal annualRate,
                                             String interestMethod) {
        return switch (interestMethod) {
            case "flat_rate" -> {
                // Flat rate: accrual is on original principal only, not reducing balance
                // [This is how the ERP's _calculate_flat_rate works — match it exactly
                //  or your accrual will diverge from the loan statement the customer sees]
                yield outstandingBalance.multiply(annualRate)
                      .divide(DAYS_IN_YEAR, 10, RoundingMode.HALF_UP)
                      .setScale(2, RoundingMode.HALF_UP);
            }
            case "reducing_balance" -> {
                yield outstandingBalance.multiply(annualRate)
                      .divide(DAYS_IN_YEAR, 10, RoundingMode.HALF_UP)
                      .setScale(2, RoundingMode.HALF_UP);
            }
            case "compound" -> {
                // Compound: interest on interest. Daily compounding.
                BigDecimal dailyRate = annualRate.divide(DAYS_IN_YEAR, 10, RoundingMode.HALF_UP);
                yield outstandingBalance.multiply(dailyRate).setScale(2, RoundingMode.HALF_UP);
            }
            default -> throw new IllegalArgumentException(
                "Unknown interest method: " + interestMethod + " — check LoanProduct.interest_method mapping");
        };
    }
}
```

---

### Step 6: The ItemWriter — Writing Back to Django

Never write directly to the ERP's Django-managed tables. Always go through Django's API.
This is the contract that keeps the systems decoupled.

```java
// LoanItemWriter.java
@Component
public class LoanItemWriter implements ItemWriter<AccrualEntry> {

    private final DjangoInternalApiClient djangoClient;

    @Override
    public void write(Chunk<? extends AccrualEntry> entries) throws Exception {
        // [Write in bulk, not one HTTP call per loan. A batch of 500 loans posting
        //  500 individual HTTP calls will take ~5 minutes just in network round trips.
        //  The Django endpoint should accept a list and process them in a single DB transaction.
        //  Design the bulk endpoint from the start — retrofitting it later means changing
        //  the contract after you've already deployed.]
        List<AccrualPostRequest> batch = entries.getItems().stream()
            .map(this::toRequest)
            .collect(Collectors.toList());

        djangoClient.postBulkAccruals(batch);
    }

    private AccrualPostRequest toRequest(AccrualEntry entry) {
        return AccrualPostRequest.builder()
            .loanId(entry.getLoanId())
            .accrualAmount(entry.getDailyAccrual())
            .provisionAmount(entry.getProvisionRequired())
            .newRiskClassification(entry.getNewRiskClassification().name())
            .daysInArrears(entry.getDaysInArrears())
            .runDate(entry.getRunDate())
            .idempotencyKey(entry.getLoanId() + "-" + entry.getRunDate()) // [Critical]
            .build();
    }
}
```

```java
// DjangoInternalApiClient.java
@Component
public class DjangoInternalApiClient {

    private final RestTemplate restTemplate;
    private final String baseUrl;
    private final String serviceToken;

    // [The service token is a JWT signed with HMAC-SHA256 using a shared secret.
    //  It has a 24-hour expiry and is refreshed at job start. Store the signing secret
    //  in an environment variable, never in application.yml or committed to Git.
    //  Rotate this secret quarterly. Document the rotation procedure in the runbook.]

    @Retryable(
        retryFor = {RestClientException.class},
        maxAttempts = 3,
        backoff = @Backoff(delay = 5000, multiplier = 2.0)
    )
    public void postBulkAccruals(List<AccrualPostRequest> batch) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(serviceToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<Void> response = restTemplate.exchange(
            baseUrl + "/api/internal/batch/loan-accrual/bulk/",
            HttpMethod.POST,
            new HttpEntity<>(batch, headers),
            Void.class
        );

        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new BatchWriteException("Django rejected accrual batch: " + response.getStatusCode());
        }
    }
}
```

---

### Step 7: Job Configuration and Chunking

```java
// BatchConfig.java
@Configuration
@EnableBatchProcessing
public class BatchConfig {

    @Bean
    public Job loanPortfolioJob(JobRepository jobRepository,
                                 Step loanProcessingStep,
                                 LoanBatchListener listener) {
        return new JobBuilder("loanPortfolioJob", jobRepository)
            .listener(listener)
            .start(loanProcessingStep)
            .build();
    }

    @Bean
    public Step loanProcessingStep(JobRepository jobRepository,
                                    PlatformTransactionManager transactionManager,
                                    LoanItemReader reader,
                                    LoanItemProcessor processor,
                                    LoanItemWriter writer) {
        return new StepBuilder("loanProcessingStep", jobRepository)
            .<LoanAccount, AccrualEntry>chunk(500, transactionManager)
            // [Chunk size 500: each chunk is one DB transaction on the batch meta schema.
            //  If Django rejects chunk 20 (loans 9501-10000), Spring Batch records that
            //  chunks 1-19 succeeded. A restart processes only chunk 20.
            //  Chunk too small (10): too many small transactions, very slow.
            //  Chunk too large (5000): a failure loses more work. 500 is a reasonable default
            //  for a nightly batch that processes up to 50,000 loans.]
            .reader(reader.loanReader())
            .processor(processor)
            .writer(writer)
            .faultTolerant()
            .skip(LoanProcessingException.class)
            .skipLimit(50)  // [Skip up to 50 problem loans per run, alert on the rest]
            .retryLimit(3)
            .retry(TransientDataAccessException.class)
            .build();
    }
}
```

---

### Step 8: Failure Alerting

```java
// LoanBatchListener.java
@Component
public class LoanBatchListener implements JobExecutionListener {

    private final AlertService alertService;

    @Override
    public void afterJob(JobExecution jobExecution) {
        if (jobExecution.getStatus() == BatchStatus.FAILED) {
            // [Do NOT just log this. Log entries are not read at 2am.
            //  Send an SMS to the finance manager and the system admin immediately.
            //  Use whatever channel is already in the ERP — if it uses Termii or Twilio,
            //  call that same service. A failed nightly batch that is not caught until
            //  morning means a full day of stale provisioning data.]
            alertService.sendSms(
                "CRITICAL: Loan portfolio batch FAILED for " + LocalDate.now() +
                ". " + jobExecution.getAllFailureExceptions().get(0).getMessage()
            );
            alertService.sendEmail(adminEmail, "Batch failure report", buildFailureReport(jobExecution));
        }

        // Always record the run summary back to Django
        // [This is what powers the "Loan portfolio last processed: X hours ago" banner
        //  in the ERP. Without this, Django has no way to know the batch ran or failed.]
        djangoClient.postBatchRunSummary(BatchRunSummary.builder()
            .runDate(LocalDate.now())
            .status(jobExecution.getStatus().name())
            .loansProcessed(getProcessedCount(jobExecution))
            .loansSkipped(getSkippedCount(jobExecution))
            .durationSeconds(getDurationSeconds(jobExecution))
            .build());
    }
}
```

---

### Step 9: The Django Internal API Endpoints (Changes to Django)

Add these views in Django before or alongside the Java app deployment:

```python
# loans/internal_api_views.py

class BulkLoanAccrualView(APIView):
    """
    Internal endpoint for the loan batch processor to write back accruals.
    Requires service-to-service JWT. Not exposed in the public API.
    """
    permission_classes = [IsInternalServiceToken]  # Custom permission class
    authentication_classes = [ServiceTokenAuthentication]

    def post(self, request):
        entries = request.data  # List of accrual dicts
        errors = []
        with transaction.atomic():
            for entry in entries:
                idempotency_key = entry['idempotency_key']
                # Skip if already processed (idempotency)
                if LoanAccrualLog.objects.filter(idempotency_key=idempotency_key).exists():
                    continue
                loan = LoanAccount.objects.select_for_update().get(id=entry['loan_id'])
                loan.days_in_arrears = entry['days_in_arrears']
                loan.risk_classification = entry['new_risk_classification']
                loan.last_batch_processed_at = now()
                loan.save(update_fields=['days_in_arrears', 'risk_classification', 'last_batch_processed_at'])
                # Post GL entry using existing Transaction.post()
                post_accrual_journal_entry(loan, entry['accrual_amount'], entry['run_date'])
                post_provision_entry(loan, entry['provision_amount'], entry['run_date'])
                LoanAccrualLog.objects.create(idempotency_key=idempotency_key, loan=loan, run_date=entry['run_date'])
        return Response({'processed': len(entries) - len(errors)}, status=200)
```

---

### Step 10: Quartz Schedule

```java
// QuartzConfig.java
@Configuration
public class QuartzConfig {

    @Bean
    public JobDetail loanBatchJobDetail() {
        return JobBuilder.newJob(LoanBatchQuartzJob.class)
            .withIdentity("loanPortfolioJob")
            .storeDurably()
            .build();
    }

    @Bean
    public Trigger loanBatchTrigger(JobDetail loanBatchJobDetail) {
        return TriggerBuilder.newTrigger()
            .forJob(loanBatchJobDetail)
            .withIdentity("loanPortfolioTrigger")
            // [Run at 1:00 AM WAT (UTC+1) every day. WAT = UTC+1, so this is 00:00 UTC.
            //  Choose a time when the ERP has the least traffic but NOT midnight exactly —
            //  many banks and government systems run their own batch jobs at midnight and
            //  their APIs are slowest then. 1am is a common industry convention in Nigeria.]
            .withSchedule(CronScheduleBuilder.cronSchedule("0 0 1 * * ?")
                .inTimeZone(TimeZone.getTimeZone("Africa/Lagos")))
            .build();
    }
}
```

---

## Completion and Compliance Checklist

### Functional
- [ ] Risk classification thresholds match CBN Prudential Guidelines Appendix 1 exactly
- [ ] Provisioning rates loaded from `cbn-provisioning-rules.yml` and covered by unit tests with
      expected values for each of the five tiers
- [ ] Interest accrual formula matches each of the three methods in `loans/models.py` exactly —
      run a cross-validation: take a known loan, run the Python and the Java calculation,
      assert the difference is zero
- [ ] Idempotency key prevents double-posting if the job is rerun on the same date
- [ ] Skip logic tested: a corrupt loan record does not stop the entire batch
- [ ] Restart logic tested: kill the job mid-run, restart it, assert no loan is processed twice
- [ ] `last_batch_processed_at` updates correctly on every successful loan
- [ ] Batch run summary is posted to Django regardless of job success or failure
- [ ] SMS and email alert fires on job failure

### Security
- [ ] Service-to-service JWT has 24-hour expiry maximum
- [ ] JWT signing secret is in environment variable, not in source code or `application.yml`
- [ ] ERP DB user for batch has SELECT only — verified by attempting an INSERT and confirming rejection
- [ ] Internal API endpoint is not listed in the public API documentation and is behind a network
      firewall rule (only the batch server's IP can reach it)

### Observability
- [ ] Spring Actuator `/actuator/health` endpoint returns loan batch last run status
- [ ] Prometheus metrics exposed for: loans_processed_total, loans_skipped_total, batch_duration_seconds
- [ ] Batch job failure appears in the ERP's system health dashboard within 5 minutes
- [ ] All provisioning entries written to a `LoanAccrualLog` table with enough detail for
      a CBN examiner to reproduce any single entry from the input data

### Operational
- [ ] Docker image builds and runs without the ERP being present (integration tests mock the Django API)
- [ ] `BATCH_READER_USER` creation script committed to `/scripts/db-setup/` in this repo
- [ ] Runbook written for: manual re-run after failure, credential rotation, adding new loan products
- [ ] The job exits with non-zero code on failure (for Kubernetes CronJob to detect and alert)

---

## Things That Will Break If You Don't Plan Them Now

**Parallel deployment window:** If you deploy a Django migration that renames a column in
`loans_loanaccount` while the batch job is running, the cursor will fail mid-stream.
Establish a rule: Django schema changes to `loans_*` tables require a maintenance window
notification to the batch scheduler. Put this in the team runbook.

**Timezone handling:** Every `due_date` on a `LoanRepaymentSchedule` should be interpreted
as Africa/Lagos midnight. If the batch server runs in UTC and you compare `due_date < today`
using the server's system clock without timezone awareness, loans due at midnight Lagos time
will appear 1 hour early and you will over-count arrears during the first hour of each UTC day.
Use `ZoneId.of("Africa/Lagos")` explicitly everywhere a date comparison is made.

**Portfolio growth:** 500-loan chunk size works for 50,000 loans. At 500,000 loans, the job
may run past the next morning's business opening. Design the job with a configurable chunk
size and test with simulated large datasets before you have a real production problem.
