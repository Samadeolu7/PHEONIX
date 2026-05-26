# App 2: Nigerian Statutory Compliance and Remittance Service

**Application Name:** `phoenix-compliance-svc`  
**Technology:** Spring Boot 3.x + Spring Integration + Apache POI + iText PDF + Spring Retry  
**Runtime Profile:** Event-driven service — wakes on payroll approval events, produces filing documents (Excel/CSV), stores them, notifies ERP to present download buttons; no automated portal submission in v1  
**Deployment:** Docker container, always-running, listens for events from Django

---

## What This App Solves

`hr/services/payroll_service.py` correctly calculates PAYE, employee pension (8%), employer
pension (10%), and Development Levy (₦1,000/year flat per employee, configurable in `HRConfig`).
NHF and NSITF are **not yet calculated** in the ERP — they are prerequisites for those schedule
generators and must be added to `payroll_service.py` before the corresponding Java generators can
produce meaningful output. `Staff.pension_provider`, `Staff.paye_pin`, and `Staff.pension_number`
fields exist on the model but are never used to submit anything to any external authority.

After `payroll.approve()` runs, two material obligations exist but are unmet:
1. PAYE must be filed and remitted to FIRS or the relevant state tax board (LIRS, OSIRS, KIRS, etc.)
   by the 10th of the following month. The filing requires a specific per-employee schedule format.
2. Pension contributions must be remitted to each employee's PFA (AIICO, ARM, Stanbic, etc.)
   in the PenCom e-remittance standard format, by the end of the month.

There is no HTTP client, no file generator, no reference number tracking, and no reconciliation
between what was deducted from payslips and what the government actually acknowledged receiving.
This is a material regulatory gap: every Nigerian employer is legally liable for this under
the Nigeria Tax Act 2025 (NTA 2025, signed 26 June 2025, effective 1 January 2026 — repeals
and consolidates PITA) and the Pension Reform Act 2014.

---

## When to Start Building This (Django Migration Trigger Points)

**You are ready to build this when:**

1. The client has processed and approved their first real (not test) monthly payroll
2. A finance manager asks "how do I generate our PAYE schedule for submission to LIRS?" —
   and there is no answer in the current ERP
3. You are preparing to go live with a client whose staff count exceeds 10 people —
   at that point manual PAYE filing becomes a monthly bottleneck

**The hard legal deadline is the forcing function:**  
PAYE remittance is due by the 10th of every month for the previous month's payroll.
Pension remittance is due by the 7th working day of every month.
If you do not have this service live before your first client processes payroll, they will
be filing manually — and they hired an ERP to avoid exactly that.

**What to change in Django before cutting over:**

1. Add `last_filed_at`, `firs_reference`, `pencom_reference`, `filing_status` fields
   to the `Payroll` model (or create a `PayrollStatutoryFiling` related model)

2. Create the internal read endpoint:
   ```
   GET /api/internal/payroll/{id}/statutory-summary/
   ```
   This is what the compliance service reads after being triggered.

3. Create the filing confirmation write-back endpoint:
   ```
   POST /api/internal/compliance/filing-confirmed/
   ```
   Django stores the government reference number and updates filing status.

4. Register a Django signal or add a call at the end of `PayrollService.approve_payroll()`
   to notify the compliance service (see Step 5 for both options).

5. Add a `filing_deadline` computed property to `Payroll` visible in the admin and
   the payroll list view — "PAYE due: May 10, 2026". Users need to see the deadline
   even when the service is not yet live.

**After cutover, the ERP UI should:**
- Show a `Filing Status` column in the payroll list: `PENDING / GENERATED / SUBMITTED / FILED / FAILED`
  - `GENERATED`: file has been produced and is available for download
  - `SUBMITTED`: finance team has uploaded to the portal but reference not yet entered
  - `FILED`: government reference number stored by finance team after upload
- Show a **Download** button on the payroll detail page once status reaches `GENERATED`
- Show a reference number entry field for the finance team to confirm their manual upload
- Show the FIRS/PENCOM reference number on the payroll detail page once `FILED`
- Block payroll period close if any approved payroll for that period has `filing_status = FAILED`

---

## Project Structure

```
phoenix-compliance-svc/
├── src/
│   └── main/
│       └── java/com/phoenix/compliance/
│           ├── ComplianceSvcApplication.java
│           ├── config/
│           │   ├── WebConfig.java                      # RestTemplate beans, timeout config
│           │   ├── RetryConfig.java                    # Spring Retry + circuit breaker config
│           │   ├── SchedulerConfig.java                # Deadline alert scheduler
│           │   └── SecurityConfig.java                 # Service token verification
│           ├── domain/
│           │   ├── PayrollSummary.java                 # DTO received from Django
│           │   ├── EmployeeStatutorySummary.java       # Per-employee breakdown
│           │   ├── FilingResult.java                   # Generated file path + outcome
│           │   └── FilingType.java                     # Enum: PAYE, PENSION (NHF/NSITF stubs — not active until ERP calculates them)
│           ├── payroll/
│           │   ├── DjangoPayrollClient.java            # Fetches payroll summary from Django
│           │   └── FilingConfirmationClient.java       # Posts reference numbers back to Django
│           ├── paye/
│           │   ├── PayeScheduleGenerator.java          # Produces state-specific per-employee Excel (OGIRS/LIRS/FCT-IRS format)
│           │   ├── StateVariantResolver.java           # Resolves LIRS vs OGIRS vs FCT-IRS vs KIRS by branch state
│           │   └── FilingPackageController.java        # REST endpoint: serves generated files for download from ERP UI
│           ├── pension/
│           │   ├── PensionScheduleGenerator.java       # Produces PenCom e-remittance CSV
│           │   └── PfaRouter.java                      # Routes contributions per PFA using Staff.pension_provider
│           ├── nhf/
│           │   └── NhfScheduleGenerator.java           # STUB ONLY — NHF not yet in payroll_service.py; implement after ERP adds NHF deduction
│           ├── nsitf/
│           │   └── NsitfScheduleGenerator.java         # STUB ONLY — NSITF not yet in payroll_service.py; implement after ERP adds NSITF deduction
│           ├── filing/
│           │   ├── FilingOrchestrator.java             # Coordinates all filing types for a payroll
│           │   ├── FilingRecord.java                   # JPA entity: immutable filing audit record
│           │   ├── FilingRecordRepository.java
│           │   └── FilingRetryService.java             # Retries FAILED filings
│           ├── deadline/
│           │   └── DeadlineAlertService.java           # Fires SMS alert if unfiled by 8th of month
│           └── monitoring/
│               └── ComplianceHealthEndpoint.java
├── src/
│   └── main/
│       └── resources/
│           ├── application.yml
│           ├── application-prod.yml
│           ├── ogirs-paye-template.xlsx            # Download from ogirs.ogunstate.gov.ng BEFORE coding PayeScheduleGenerator
│           ├── pencom-schedule-template.xlsx       # Official PenCom e-remittance template v3.1
│           └── tax-bands.yml                       # PAYE bands (NTA 2025, effective Jan 2026)
├── src/test/
│   └── java/com/phoenix/compliance/
│       ├── paye/
│       │   ├── PayeScheduleGeneratorTest.java          # Golden file tests against official samples
│       │   └── TaxBandCalculationTest.java
│       └── pension/
│           └── PensionScheduleGeneratorTest.java
├── docker/
│   └── Dockerfile
├── pom.xml
└── README.md
```

---

## Step-by-Step Implementation

### Step 1: Project Scaffolding

Dependencies:
```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.retry</groupId>
  <artifactId>spring-retry</artifactId>
</dependency>
<dependency>
  <groupId>org.apache.poi</groupId>
  <artifactId>poi-ooxml</artifactId>
  <version>5.3.0</version>
  <!-- [Pin this explicitly. Apache POI has had security advisories (CVE-2022-26336,
       CVE-2021-31811) around crafted Excel files. Always use the latest patch release
       and check for new CVEs before each compliance service deployment.] -->
</dependency>
<dependency>
  <groupId>com.itextpdf</groupId>
  <artifactId>itext-core</artifactId>
  <version>9.1.0</version>
  <!-- [iText for signed PDF generation. The PAYE schedule PDF must be digitally signed
       if the client has a digital certificate — some state tax boards require this.
       iText's signing API handles PAdES signatures which is what Nigerian e-filing portals
       typically require.] -->
</dependency>
<dependency>
  <groupId>jakarta.xml.bind</groupId>
  <artifactId>jakarta.xml.bind-api</artifactId>
  <!-- For FIRS TaxPro-Max XML marshalling -->
</dependency>
```

---

### Step 2: The Trigger — How Django Notifies This Service

**Start with the direct HTTP call (Option A) — simpler to build and debug:**

In Django's `PayrollService.approve_payroll()`, add at the very end:

```python
# hr/services/payroll_service.py

def approve_payroll(self, payroll_id, approved_by):
    # ... existing approval logic ...
    payroll.status = 'approved'
    payroll.save()
    # GL entries posted by existing code
    
    # Notify compliance service asynchronously via Celery task
    # [Use a Celery task, not a synchronous HTTP call here.
    #  If the compliance service is down during payroll approval, a synchronous call
    #  will make approve_payroll() raise an exception and roll back the payroll approval.
    #  The compliance filing is important but it must NOT prevent payroll approval from completing.
    #  Decouple with a task that retries independently.]
    from hr.tasks import notify_compliance_service
    notify_compliance_service.apply_async(args=[payroll_id], countdown=5)
```

```python
# hr/tasks.py (new task)
@shared_task(bind=True, max_retries=10, default_retry_delay=300)
def notify_compliance_service(self, payroll_id):
    import requests
    from django.conf import settings
    try:
        response = requests.post(
            f"{settings.COMPLIANCE_SERVICE_URL}/api/v1/filings/trigger/",
            json={"payroll_id": payroll_id},
            headers={"Authorization": f"Bearer {settings.COMPLIANCE_SERVICE_TOKEN}"},
            timeout=10
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise self.retry(exc=exc)
```

---

### Step 3: Filing Orchestrator

```java
// FilingOrchestrator.java
@Service
public class FilingOrchestrator {

    private final DjangoPayrollClient payrollClient;
    private final PayeScheduleGenerator payeGenerator;
    private final PensionScheduleGenerator pensionGenerator;
    private final FilingPackageStorage packageStorage;       // Stores generated file bytes (local path or S3)
    private final FilingReadyNotificationClient notificationClient; // Tells Django: "PAYE file ready, here is the download URL"
    private final FilingRecordRepository filingRecords;

    // [v1 ARCHITECTURE: Generate → Store → Notify. No automated portal submission.
    //  OGIRS, LIRS, and PenCom portals do not expose public REST APIs as of 2026.
    //  The finance manager downloads the generated file from the ERP and uploads it manually
    //  to the relevant portal. They then enter the reference number back into the ERP.
    //  This is Tier 1. Tier 2 (automated submission) is a future enhancement
    //  when state tax authority APIs become available. Do not build FirsSubmissionClient.java
    //  or PencomSubmissionClient.java for v1 — there is no endpoint to call.]

    public void processPayrollFiling(Long payrollId) {
        // [Log every step with the payroll ID and a correlation ID.
        //  When a tax authority disputes a filing, you need to reproduce the exact sequence
        //  of events: when was it triggered, what data was fetched, what file was generated,
        //  when was it submitted, what was the response. This is a compliance requirement,
        //  not optional logging.]
        String correlationId = UUID.randomUUID().toString();
        log.info("[{}] Starting filing for payroll {}", correlationId, payrollId);

        PayrollSummary payroll = payrollClient.fetchStatutorySummary(payrollId);

        // PAYE filing
        try {
            byte[] payeFile = payeGenerator.generateExcelSchedule(payroll);
            String downloadUrl = packageStorage.store(payrollId, FilingType.PAYE, payeFile);
            recordFiling(payrollId, FilingType.PAYE, downloadUrl, correlationId);
            // Notify Django: status → GENERATED, download URL stored
            notificationClient.notifyFileReady(payrollId, FilingType.PAYE, downloadUrl);
        } catch (Exception e) {
            log.error("[{}] PAYE file generation failed for payroll {}", correlationId, payrollId, e);
            recordFailure(payrollId, FilingType.PAYE, e.getMessage(), correlationId);
            // [Do NOT rethrow here and skip pension filing.
            //  PAYE and pension are independent obligations.
            //  A PAYE failure should not prevent pension remittance from proceeding.
            //  Record both failures separately so the finance team can action them independently.]
        }

        // Pension filing — per PFA
        Map<String, List<EmployeeStatutorySummary>> byPfa = groupByPfa(payroll.getEmployees());
        byPfa.forEach((pfaName, employees) -> {
            try {
                byte[] pensionCsv = pensionGenerator.generatePencomCsv(employees,
                    resolvePfaCode(pfaName), YearMonth.from(payroll.getPeriod()));
                String downloadUrl = packageStorage.store(payrollId, FilingType.PENSION, pfaName, pensionCsv);
                recordFiling(payrollId, FilingType.PENSION, pfaName, downloadUrl, correlationId);
                notificationClient.notifyFileReady(payrollId, FilingType.PENSION, pfaName, downloadUrl);
            } catch (Exception e) {
                log.error("[{}] Pension file generation failed for PFA {} payroll {}", correlationId, pfaName, payrollId, e);
                recordFailure(payrollId, FilingType.PENSION, pfaName + ": " + e.getMessage(), correlationId);
            }
        });
    }
}
```

---

### Step 4: PAYE Schedule Generator

```java
// PayeScheduleGenerator.java
@Component
public class PayeScheduleGenerator {

    // [Download the OGIRS portal upload template from ogirs.ogunstate.gov.ng BEFORE
    //  writing a single line of this class. Column names, order, and header format vary
    //  by state tax authority. For multi-branch clients, you may need separate templates
    //  for OGIRS (Ogun), LIRS (Lagos), and FCT-IRS (Abuja).
    //  If your column order is wrong, the portal silently rejects the file or throws
    //  a cryptic validation error with no indication of which column is wrong.
    //  Build this against the actual downloaded template, not a guessed format.
    //  There is no FIRS TaxPro-Max XML API to target — state portals accept Excel upload only.]

    public byte[] generateExcelSchedule(PayrollSummary payroll) throws IOException {
        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("PAYE Schedule");

            // Header row — exact FIRS column names
            Row header = sheet.createRow(0);
            String[] columns = {
                "S/N", "Employee Name", "TIN", "Grade Level",
                "Annual Gross Income", "Taxable Income", "Monthly Tax",
                "Tax Deducted (YTD)", "Pension (Employee)", "NHF"
            };
            // [Column widths matter. FIRS validation scripts sometimes check for minimum
            //  column width on the submitted file. Set explicit widths based on the official template.]
            for (int i = 0; i < columns.length; i++) {
                header.createCell(i).setCellValue(columns[i]);
                sheet.setColumnWidth(i, 5000);
            }

            CellStyle monetaryStyle = createMonetaryStyle(workbook);
            // [Always format monetary cells as numbers with 2 decimal places.
            //  If you format them as strings, Excel cannot sum the column,
            //  and the FIRS validation portal will flag the total as mismatched.
            //  Use the named cell style 'Currency (NGN)' that FIRS expects.]

            int rowNum = 1;
            for (EmployeeStatutorySummary emp : payroll.getEmployees()) {
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(rowNum - 1);     // S/N
                row.createCell(1).setCellValue(emp.getFullName());
                row.createCell(2).setCellValue(emp.getPayePin());
                row.createCell(3).setCellValue(emp.getGradeLevel());
                Cell grossCell = row.createCell(4);
                grossCell.setCellValue(emp.getAnnualGrossIncome().doubleValue());
                grossCell.setCellStyle(monetaryStyle);
                // ... remaining columns
            }

            // Footer: Employer TIN, employer name, total row
            // [Mandatory footer — some state tax boards reject files without it]
            addEmployerFooter(sheet, payroll, rowNum);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        }
    }
}
```

---

### Step 5: PAYE Tax Band Configuration

```yaml
# tax-bands.yml — Nigeria Tax Act 2025 (NTA 2025, signed 26 June 2025, effective 1 January 2026)
# [Update this file every year after any Finance Act amendments.
#  Commit the Act year and section number in the git commit message — this is your audit trail.
#  CRITICAL: These bands MUST be identical to payroll_service.py PAYE_BANDS.
#  Run TaxBandCalculationTest.java against 10 known payslips before every deployment.
#  A PAYE schedule that doesn't match the payslips issued = grounds for a FIRS/OGIRS query.]
paye:
  annual_bands:
    - threshold: 800000
      rate: 0.00
      description: "First ₦800,000 — zero-rated (NTA 2025)"
    - threshold: 2200000
      rate: 0.15
      description: "Next ₦2,200,000 @ 15% (cumulative to ₦3,000,000)"
    - threshold: 9000000
      rate: 0.18
      description: "Next ₦9,000,000 @ 18% (cumulative to ₦12,000,000)"
    - threshold: 13000000
      rate: 0.21
      description: "Next ₦13,000,000 @ 21% (cumulative to ₦25,000,000)"
    - threshold: 25000000
      rate: 0.23
      description: "Next ₦25,000,000 @ 23% (cumulative to ₦50,000,000)"
    - threshold: null
      rate: 0.25
      description: "Balance above ₦50,000,000 @ 25%"
  personal_relief:
    fixed_annual_relief: 200000     # Flat ₦200,000 — matches payroll_service.py FIXED_RELIEF constant
    # [The NTA 2025 full CRA formula is max(200,000, 1% of gross) + 20% of gross.
    #  The ERP uses only the flat ₦200,000 for simplicity (payroll_service.py FIXED_RELIEF).
    #  This Java service must use the SAME simplified figure to match payslip amounts.
    #  If you implement the full formula here but Django uses the flat relief, your
    #  filed schedule will not reconcile with the payslips — immediate audit risk.]
    pension_deductible: true        # Employee 8% pension deducted from taxable income before bands
    nhf_deductible: false           # NHF not yet in ERP — do not claim this deduction until ERP adds it
  nta_year: 2025
  effective_from: "2026-01-01"
```

```java
// [Cross-validate the PAYE calculation in this service against payroll_service.py.
//  Run the same test cases through both. The numbers must be identical to 2 decimal places.
//  If they differ, find out why before this service generates its first real filing —
//  a PAYE return that does not match the payslip amounts is grounds for a tax authority query.]
```

---

### Step 6: Pension Schedule Generator

```java
// PensionScheduleGenerator.java
@Component
public class PensionScheduleGenerator {

    // [PenCom e-remittance format v3.1 (current as of 2025) requires:
    //  Employer PEN code, PFA Code, RSA PIN (not NIN), Employee Name,
    //  Employee Contribution (8% of pensionable pay), Employer Contribution (10%),
    //  Total Contribution, Month/Year of contribution.
    //  'Pensionable pay' = Basic + Housing + Transport per Pension Reform Act 2014 Section 4.
    //  This must match what payroll_service.py calculates — verify it does before filing.]

    public byte[] generatePencomCsv(List<EmployeeStatutorySummary> employees,
                                     String pfaCode,
                                     YearMonth period) {
        StringBuilder csv = new StringBuilder();
        // Header required by PenCom
        csv.append("EMPLOYER_PEN,PFA_CODE,RSA_PIN,EMPLOYEE_NAME,")
           .append("EMPLOYEE_CONTRIBUTION,EMPLOYER_CONTRIBUTION,TOTAL,PERIOD\n");

        for (EmployeeStatutorySummary emp : employees) {
            csv.append(emp.getEmployerPenCode()).append(",")
               .append(pfaCode).append(",")
               .append(emp.getRsaPin()).append(",")   // [This comes from Staff.pension_number in Django]
               .append(escapeCSV(emp.getFullName())).append(",")
               .append(emp.getEmployeePension().toPlainString()).append(",")
               .append(emp.getEmployerPension().toPlainString()).append(",")
               .append(emp.getEmployeePension().add(emp.getEmployerPension()).toPlainString()).append(",")
               .append(period.format(DateTimeFormatter.ofPattern("MM/yyyy"))).append("\n");
        }

        // [Always generate this as UTF-8 BOM. PenCom's portal sometimes misreads UTF-8 without BOM
        //  and garbles employee names with accents or special characters (Adéọlá, Ngọzị, etc.).]
        byte[] bom = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
        byte[] content = csv.toString().getBytes(StandardCharsets.UTF_8);
        byte[] result = new byte[bom.length + content.length];
        System.arraycopy(bom, 0, result, 0, bom.length);
        System.arraycopy(content, 0, result, bom.length, content.length);
        return result;
    }
}
```

---

### Step 7: State Tax Board Routing

Different branches may have employees subject to different state tax authorities:

```java
// StateVariantResolver.java
@Component
public class StateVariantResolver {

    // [This is a critical correctness problem that most ERP implementations get wrong.
    //  PAYE is remitted to the tax authority of the STATE WHERE THE EMPLOYEE WORKS,
    //  not where the company is headquartered. A Lagos company with a branch in Abuja:
    //  Lagos-based employees → LIRS. Abuja-based employees → FCT-IRS.
    //  If all employees are filed with LIRS, the Abuja employees' PAYE is being sent
    //  to the wrong authority — this is a compliance violation even if the money was paid.]

    private static final Map<String, String> STATE_TO_TAX_AUTHORITY = Map.ofEntries(
        Map.entry("Lagos", "LIRS"),
        Map.entry("Abuja", "FCT-IRS"),
        Map.entry("Ogun", "OGIRS"),
        Map.entry("Rivers", "RIRS"),
        Map.entry("Kano", "KIRS"),
        Map.entry("Oyo", "OYIRS"),
        Map.entry("Anambra", "ATIRS")
        // ... extend as needed
    );

    public String resolveAuthority(String branchState) {
        return STATE_TO_TAX_AUTHORITY.getOrDefault(branchState, "FIRS");
        // [Default to FIRS only if state cannot be determined — never silently fail.
        //  Log a warning when this fallback is hit so the operations team can add
        //  the missing state mapping.]
    }
}
```

---

### Step 8: Immutable Filing Audit Record

Every submission must be permanently recorded, whether successful or failed:

```java
// FilingRecord.java
@Entity
@Table(name = "compliance_filing_records")
public class FilingRecord {

    // [This table must be immutable. No UPDATE, no DELETE, no soft delete.
    //  It is your legal evidence that you filed on time.
    //  If a client is audited by FIRS and asks "did you file our April 2026 PAYE?",
    //  this record is the answer, including the exact bytes that were submitted.
    //  Store the file hash, not the file itself — the file can be regenerated from the
    //  payroll data, but the hash proves the content you submitted is unchanged.]

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private Long payrollId;           // Foreign key to Django — not a DB constraint

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FilingType filingType;    // PAYE, PENSION, NHF, NSITF

    @Column(nullable = false)
    private String authority;         // LIRS, FIRS, PENCOM, etc.

    @Column
    private String governmentReference;  // What the authority returned on success

    @Column(nullable = false)
    private String status;            // SUBMITTED, FAILED, PENDING_ACK

    @Column(nullable = false)
    private String fileHash;          // SHA-256 of the submitted file

    @Column
    private String failureReason;

    @Column(nullable = false)
    private BigDecimal amountFiled;   // Total amount in the filing

    @Column(nullable = false)
    private YearMonth filingPeriod;

    @Column(nullable = false)
    private String correlationId;     // Links all log lines for this filing

    @Column(nullable = false, updatable = false)
    private Instant submittedAt;

    // [No @PreUpdate or any lifecycle callback that modifies this entity.
    //  If you need to update status, insert a new record with status ACKNOWLEDGED
    //  and link it to the original via correlationId. Append-only audit table.]
}
```

---

### Step 9: Deadline Alert Service

```java
// DeadlineAlertService.java
@Component
public class DeadlineAlertService {

    // [Runs at 8:00 AM WAT on the 8th of every month.
    //  PAYE is due the 10th. This gives the finance team exactly 2 working days
    //  to chase a failed filing. Running this on the 9th is too late.]
    @Scheduled(cron = "0 0 8 8 * ?", zone = "Africa/Lagos")
    public void checkPayeDeadlines() {
        YearMonth lastMonth = YearMonth.now().minusMonths(1);

        List<Long> unfiled = filingRecordRepository
            .findPayrollIdsWithNoSuccessfulFiling(lastMonth, FilingType.PAYE);

        if (!unfiled.isEmpty()) {
            String message = String.format(
                "URGENT: PAYE for %s has not been filed for %d payroll(s). " +
                "Deadline is the 10th. Payroll IDs: %s",
                lastMonth, unfiled.size(), unfiled
            );
            alertService.sendSms(financeManagerPhone, message);
            alertService.sendEmail(financeManagerEmail, "PAYE Filing Deadline Alert", message);
            log.warn("PAYE deadline alert sent for period {}: {} payrolls unfiled", lastMonth, unfiled.size());
        }
    }

    @Scheduled(cron = "0 0 8 5 * ?", zone = "Africa/Lagos")
    public void checkPensionDeadlines() {
        // [Pension is due the 7th working day — not calendar day.
        //  This is a business day calculation that must account for Nigerian public holidays.
        //  Maintain a `NigerianPublicHoliday` configuration table or list.
        //  Alert on the 5th calendar day to give enough buffer.]
        YearMonth lastMonth = YearMonth.now().minusMonths(1);
        List<String> unfiledPfas = filingRecordRepository
            .findPfasWithNoSuccessfulPensionFiling(lastMonth);
        if (!unfiledPfas.isEmpty()) {
            alertService.sendSms(financeManagerPhone,
                "URGENT: Pension for " + lastMonth + " not filed for PFAs: " + unfiledPfas);
        }
    }
}
```

---

### Step 10: Retry Service for Failed Filings

```java
// FilingRetryService.java
@Service
public class FilingRetryService {

    // [Run a retry sweep every 2 hours for any filing in FAILED status.
    //  Government APIs — FIRS TaxPro-Max specifically — have known availability issues:
    //  - The portal is often unavailable from 11pm to 2am WAT (maintenance window)
    //  - Timeout frequently during month-end peak
    //  - Returns 200 OK but with an error body (parse the body, not just the status code)
    //  Retry with exponential backoff up to the deadline. After the deadline, stop retrying
    //  and escalate — do not keep hammering a government API after the legal deadline
    //  because late filing attracts a penalty, not no-filing.]

    @Scheduled(fixedDelay = 7200000)  // Every 2 hours
    public void retryFailedFilings() {
        LocalDate today = LocalDate.now(ZoneId.of("Africa/Lagos"));
        List<FilingRecord> failed = filingRecordRepository
            .findByStatusAndSubmittedAtAfter("FAILED",
                Instant.now().minus(30, ChronoUnit.DAYS));

        for (FilingRecord record : failed) {
            if (isBeforeDeadline(record.getFilingPeriod(), record.getFilingType(), today)) {
                try {
                    filingOrchestrator.retryFiling(record);
                } catch (Exception e) {
                    log.error("Retry failed for filing {} payroll {}", record.getId(), record.getPayrollId(), e);
                }
            } else {
                log.warn("Filing {} is past deadline — manual intervention required", record.getId());
                alertService.sendEmail(systemAdminEmail,
                    "Past-deadline filing requires manual action: " + record.getId());
            }
        }
    }
}
```

---

### Step 11: The Django Internal API — Statutory Summary Endpoint

Add this to Django. The compliance service calls this once after being triggered:

```python
# hr/internal_api_views.py

class PayrollStatutorySummaryView(APIView):
    permission_classes = [IsInternalServiceToken]

    def get(self, request, payroll_id):
        payroll = get_object_or_404(Payroll, id=payroll_id, status='approved')
        payslips = payroll.payslip_set.select_related('staff').all()

        employees = []
        for payslip in payslips:
            staff = payslip.staff
            employees.append({
                'staff_id': staff.id,
                'full_name': f"{staff.first_name} {staff.last_name}",
                'paye_pin': staff.paye_pin,        # Field exists, now used
                'pension_provider': staff.pension_provider,
                'rsa_pin': staff.pension_number,   # RSA PIN — same field, now used
                'employer_pen_code': payroll.branch.employer_pen_code,  # Add this field to Branch
                'branch_state': staff.branch.state,
                'basic_salary': str(payslip.basic_salary),
                'pensionable_pay': str(payslip.basic_salary + payslip.housing_allowance + payslip.transport_allowance),
                'annual_gross_income': str(payslip.gross_salary * 12),
                'taxable_income': str(payslip.taxable_income),
                # [payslip.taxable_income = basic + overtime + taxable allowances, BEFORE pension deduction
                #  payslip.annual_taxable_income = (taxable_income - employee_pension) * 12
                #  The PAYE schedule should use annual_taxable_income for the band calculation
                #  to match what payroll_service.py actually calculated. See TAX_AND_PENSION_TECHNICAL_REFERENCE.md Section 3.]
                'monthly_paye': str(payslip.tax),             # payslip.tax = monthly PAYE (see TAX_AND_PENSION_TECHNICAL_REFERENCE.md)
                'employee_pension': str(payslip.employee_pension),
                'employer_pension': str(payslip.employer_pension),
                # NHF not yet calculated in payroll_service.py — NhfScheduleGenerator is a stub
                # until payroll_service.py adds the NHF deduction field to payslips
                'ytd_paye': str(calculate_ytd_paye(staff, payroll.period_end)),
            })

        return Response({
            'payroll_id': payroll_id,
            'period': str(payroll.period_month),
            'period_year': payroll.period_year,
            'branch_tin': payroll.branch.tin,      # Add TIN to Branch model if not present
            'company_name': payroll.branch.name,
            'employees': employees,
        })
```

---

## Completion and Compliance Checklist

### Functional Correctness
- [ ] PAYE calculation in Java produces identical results to `payroll_service.py` for the same
      inputs — run 10 test cases through both and assert equality to 2 decimal places
- [ ] Tax bands in `tax-bands.yml` match NTA 2025 (effective Jan 2026) AND match `payroll_service.py` PAYE_BANDS constant exactly
- [ ] Fixed annual relief of ₦200,000 matches `payroll_service.py` FIXED_RELIEF constant — the ERP does NOT use max(200k, 1%) formula
- [ ] Pension deducted from monthly chargeable income BEFORE band calculation (per NTA 2025) — matches order in payroll_service.py
- [ ] Per-employee YTD PAYE computed correctly (cumulative from January)
- [ ] Multi-branch payroll routes employees to the correct state tax authority
- [ ] PFA routing correctly splits employees by `Staff.pension_provider` before generating CSV
- [ ] Pension schedule totals for each PFA agree with the GL pension payable entry for that period
- [ ] Filing retry does not fire after the legal deadline
- [ ] Deadline alert fires at 8am WAT on the 8th — test in staging against a fake payroll

### File Format Compliance
- [ ] PAYE Excel matches the OGIRS portal upload template exactly — download the actual template
      from ogirs.ogunstate.gov.ng before writing PayeScheduleGenerator.java; test by uploading
      a sample file to the OGIRS portal and confirming successful validation
- [ ] ERP shows “Download PAYE Schedule” button after `filing_status` reaches `GENERATED`
- [ ] ERP reference number entry field allows finance team to record manual upload confirmation
- [ ] PenCom CSV validated against PenCom's published e-remittance format v3.1
- [ ] PDF copy of PAYE schedule is signed if the client has a digital certificate configured
- [ ] All generated files use UTF-8 BOM encoding

### Regulatory
- [ ] `FilingRecord` is immutable — confirmed by attempting an UPDATE and verifying it fails
- [ ] `FilingRecord.fileHash` is SHA-256 of the exact bytes submitted (reproducible)
- [ ] Government reference number stored for every successful submission
- [ ] `correlationId` links all log lines, the generated file, the submission request, and
      the government response for a single filing event

### Security
- [ ] FIRS and PenCom API credentials stored in environment variables, not application.yml
- [ ] Service-to-service JWT verified on every inbound request from Django
- [ ] No employee data (TIN, RSA PIN) written to log files even on debug level
- [ ] Generated filing files stored temporarily in a secure path with restricted permissions,
      deleted after submission confirmed or after 24 hours

### Operational
- [ ] Django's `notify_compliance_service` Celery task retries on connection failure
- [ ] Compliance service `/actuator/health` reflects last filing status
- [ ] A failed filing is visible in the ERP's payroll list view (filing_status = FAILED)
      within 5 minutes of failure

---

## Things That Will Break If You Don't Plan Them Now

**The NTA 2025 bands are now live in the ERP — cross-validate every year.** `tax-bands.yml` and `payroll_service.py` PAYE_BANDS must always match. Build a startup check that logs the `effective_from` date and warns if it diverges from the ERP's band constant. Any Finance Act amendment requires updating both files in the same deployment.

**Staff.paye_pin and Staff.pension_number are currently empty for most employees.** Before this
service can file anything, the ERP must have a data collection workflow to capture these for every
active staff member. Budget time for that data entry — it is a blocker for the first real filing.

**OGIRS, LIRS, and PenCom portals have no public REST API — manual portal upload is the current
reality.** `FirsSubmissionClient.java` and `PencomSubmissionClient.java` do not exist in v1 because
there is no endpoint to call. OGIRS has a self-service portal at `ogirs.ogunstate.gov.ng` where
a human logs in, uploads the Excel file this service generates, and copies the reference number
back into the ERP. That workflow is the entire Tier 1 value proposition — the ERP produces the
correct ready-to-upload file in seconds instead of the finance team spending hours typing from
payslips. Tier 2 automated submission is a future enhancement when state tax authority APIs
become available. Do not build submission clients speculatively for v1.

**NHF and NSITF are not calculated in the ERP — this is a hard prerequisite.** The ERP's
`payroll_service.py` does not currently calculate NHF or NSITF. `NhfScheduleGenerator.java`
and `NsitfScheduleGenerator.java` are stubs. Before these generators can produce meaningful
output, NHF and NSITF deductions must be added to `payroll_service.py` and the corresponding
payslip fields must exist. Flag this as a two-sprint prerequisite, not a concurrent task.
