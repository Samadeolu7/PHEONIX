# Java Learning Roadmap — Build While You Learn

**Goal:** Learn Java by building the three Phoenix ERP companion services.  
**Platform:** [Baeldung](https://www.baeldung.com) — free articles + paid courses where noted.  
**Approach:** You do not finish learning Java before writing code. Each phase teaches exactly
what you need for the next build step, then you go write it immediately.

---

## How to Read This Document

Each phase has three parts:

1. **Study** — specific Baeldung pages to read, in order
2. **Build** — the exact step(s) from the app files you write immediately after
3. **Why now** — what connects the concept to the code

Some phases are **shared** (the knowledge applies to all three apps).  
Some phases are **app-specific** (only needed for one app — skip until you get to that app).

You will visit Baeldung dozens of times during this project. Bookmark it now.

---

## Overview — The Full Journey at a Glance

```
PHASE 0 │ Java Foundations (no Spring yet)
         │   └── Unlocks: Understanding every piece of code in all 3 apps
PHASE 1 │ Spring Boot Core
         │   └── Unlocks: App 1 Step 1, App 2 Step 1, App 3 Step 1 (scaffolding all 3)
PHASE 2 │ Database Access — JDBC and JPA
         │   └── Unlocks: App 1 Step 2–3, App 3 Step 2
PHASE 3 │ REST Clients and Retry
         │   └── Unlocks: App 1 Step 6–7, App 2 Step 2–3, App 3 Step 7–8
PHASE 4 │ Spring Batch (App 1 focused, concepts apply everywhere)
         │   └── Unlocks: App 1 Step 4–8 (the full batch job)
PHASE 5 │ Scheduling, Events, Integration Basics
         │   └── Unlocks: App 1 Step 10, App 2 Step 5–9, App 3 Step 5–6
PHASE 6 │ File Generation — Excel, PDF, CSV
         │   └── Unlocks: App 2 Step 4–6 (PAYE/Pension file generators)
PHASE 7 │ Spring Integration and Circuit Breakers
         │   └── Unlocks: App 3 Step 3–6 (the bank polling daemon)
PHASE 8 │ Security Between Services
         │   └── Unlocks: All apps (service-to-service JWT in every write-back)
PHASE 9 │ Testing, Observability, Docker
         │   └── Unlocks: Completion checklists across all 3 apps
```

---

## PHASE 0 — Java Foundations

> You need this before writing a single line of any of the three apps.  
> Time: ~1 week of reading and small exercises.  
> Do not skip this even if you are familiar with Python. The concepts are transferable
> but the specifics (types, BigDecimal, enums, interfaces) are not.

### Study List

**0.1 — How Java Differs From Python**  
Start here. Java is statically typed. You declare what type every variable is.  
Read: [Baeldung — Java vs Python: Key Differences](https://www.baeldung.com/java-python-differences)  
Also read: [Baeldung — Introduction to Java](https://www.baeldung.com/get-started-with-java-series)  
*(This is a multi-part series — read all parts)*

**0.2 — Types, Classes, and Objects**  
Everything in Java is a class. There are no standalone functions.  
Read: [Baeldung — Java Classes and Objects](https://www.baeldung.com/java-classes-objects)  
Read: [Baeldung — Java Constructors](https://www.baeldung.com/java-constructors)

**0.3 — Interfaces**  
Interfaces are the most important concept to understand before reading any of the app code.
`BankConnector` in App 3 is an interface. `ItemReader`, `ItemWriter`, `ItemProcessor` in
App 1 are all interfaces. If you do not understand interfaces, none of the Spring Batch
or Spring Integration code will make sense.  
Read: [Baeldung — Interfaces in Java](https://www.baeldung.com/java-interfaces)  
Read: [Baeldung — Abstract Classes vs Interfaces](https://www.baeldung.com/java-abstract-class)

**0.4 — BigDecimal (Critical for accounting work)**  
Every monetary value in all three apps uses `BigDecimal`. Never `double`. Never `float`.  
Read: [Baeldung — BigDecimal and BigInteger](https://www.baeldung.com/java-bigdecimal-biginteger)

> **Practice task (do this immediately after reading 0.4):**  
> Write a Java class called `MoneyCalculator` with a single method:  
> `BigDecimal calculateDailyInterest(BigDecimal principal, BigDecimal annualRate)`  
> that returns `(principal × annualRate) / 365` rounded to 2 decimal places with `HALF_UP`.  
> This is the exact calculation from App 1 Step 5 `InterestAccrualEngine.java`.  
> When you build App 1 Step 5 later, you will already understand every line.

**0.5 — Enums**  
`RiskClassification` in App 1 is an enum. `FilingType` in App 2 is an enum.
`MatchConfidence` in App 3 is an enum.  
Read: [Baeldung — A Guide to Java Enums](https://www.baeldung.com/a-guide-to-java-enums)

**0.6 — Collections: List, Map, Optional**  
The apps use `List`, `Map`, and `Optional` everywhere.  
Read: [Baeldung — Java Collections Overview](https://www.baeldung.com/java-collections)  
Read: [Baeldung — Java Optional](https://www.baeldung.com/java-optional)

**0.7 — Java Streams (used heavily in App 3 matching engine)**  
The matching engine pipeline in App 3 Step 6 is all streams.  
Read: [Baeldung — Java 8 Streams](https://www.baeldung.com/java-8-streams)  
Read: [Baeldung — Java Stream Collectors](https://www.baeldung.com/java-8-collectors)

> **Practice task:**  
> Take a `List<Integer>` of loan amounts: `[5000, 12000, 800, 45000, 200, 9500]`.  
> Use streams to: filter amounts over 1000, multiply each by 0.05 (5% provision),
> and collect the results into a new `List<Double>`.  
> This mirrors what `ProvisioningRuleEngine` does across a list of loans in App 1.

**0.8 — Switch Expressions (Java 14+)**  
`InterestAccrualEngine.java` in App 1 Step 5 uses a switch expression.  
Read: [Baeldung — Java Switch Statement](https://www.baeldung.com/java-switch)

**0.9 — Generics**  
Spring Batch `ItemReader<LoanAccount>`, `ItemWriter<AccrualEntry>` are generic types.  
Without generics, the type parameters in angle brackets will look like noise.  
Read: [Baeldung — Generics in Java](https://www.baeldung.com/java-generics)

**0.10 — Builder Pattern (used by Lombok)**  
All the DTO objects in the apps are built with `.builder()`. This is the Builder pattern,
implemented by Lombok. You need to understand what it replaces (constructors with 10 params).  
Read: [Baeldung — Builder Design Pattern in Java](https://www.baeldung.com/creational-design-patterns#builder)

### After Phase 0, you can read all three app files and understand every class and method.

---

## PHASE 1 — Spring Boot Core

> This is the foundation all three apps share. Do this once.  
> Time: ~1 week.

### Study List

**1.1 — What Spring Is and What It Does**  
Spring does dependency injection for you. Instead of `new LoanItemReader()`, you annotate
the class with `@Component` and Spring creates and wires it automatically. This is called
the IoC (Inversion of Control) container.  
Read: [Baeldung — Intro to the Spring IoC Container](https://www.baeldung.com/inversion-control-and-dependency-injection-in-spring)

**1.2 — Spring Boot vs Spring (the difference)**  
Spring Boot is Spring with defaults pre-configured. `spring-boot-starter-batch` gives you
a fully wired Spring Batch environment without 200 lines of XML configuration.  
Read: [Baeldung — Spring vs Spring Boot](https://www.baeldung.com/spring-vs-spring-boot)

**1.3 — Your First Spring Boot Application**  
Build a minimal Spring Boot app with a single REST endpoint. This is the skeleton for all three apps.  
Read: [Baeldung — Spring Boot Tutorial — Bootstrap a Simple Application](https://www.baeldung.com/spring-boot-start)

> **Paid course option:** [Baeldung — Learn Spring](https://www.baeldung.com/learn-spring-course)  
> This is their flagship course. It covers everything in Phases 1–3 with video + exercises.  
> If you can afford one Baeldung course, buy this one. It will save you 2 weeks of reading.

**1.4 — Spring Annotations You Will See Constantly**  
Every class in all three apps uses these.  
Read: [Baeldung — Spring Core Annotations](https://www.baeldung.com/spring-core-annotations)  
Focus on: `@Component`, `@Service`, `@Repository`, `@Bean`, `@Configuration`,
`@Autowired`, `@Qualifier`, `@Value`

**1.5 — application.yml Configuration**  
Every app has `application.yml`. This is how external config (DB credentials, URLs, secrets)
is loaded without hardcoding.  
Read: [Baeldung — Properties with Spring and Spring Boot](https://www.baeldung.com/properties-with-spring)  
Read: [Baeldung — YAML in Spring Boot](https://www.baeldung.com/spring-yaml)

**1.6 — Spring Profiles (prod vs dev config)**  
The apps have `application.yml` and `application-prod.yml`. Profiles control which one loads.  
Read: [Baeldung — Spring Profiles](https://www.baeldung.com/spring-profiles)

**1.7 — Spring Boot Actuator (Health Endpoints)**  
Every app has a health endpoint. Actuator provides this out of the box.  
Read: [Baeldung — Spring Boot Actuator](https://www.baeldung.com/spring-boot-actuators)

### Build Immediately After Phase 1

Go to **App 1 Step 1**, **App 2 Step 1**, **App 3 Step 1** — scaffold all three projects
at [start.spring.io](https://start.spring.io) using the dependency lists in each file.  
Configure `application.yml` with placeholder values.  
Add the Actuator dependency and confirm `/actuator/health` returns `{"status":"UP"}`.

> You now have three running (empty) Spring Boot applications. This is the foundation.

---

## PHASE 2 — Database Access: JDBC and JPA

> This covers how Java talks to PostgreSQL. Needed for App 1 (read loans via JDBC)
> and App 3 (read/write the bank_feed schema via JPA).  
> Time: ~1 week.

### Study List

**2.1 — Spring Data JPA Basics**  
JPA (Java Persistence API) maps Java classes to database tables. `@Entity`, `@Table`,
`@Column`, `@Id` — these are the JPA annotations on every entity in App 2 and App 3.  
Read: [Baeldung — Introduction to Spring Data JPA](https://www.baeldung.com/the-persistence-layer-with-spring-data-jpa)

**2.2 — Spring Data Repositories**  
`FilingRecordRepository` in App 2 and `BankTransactionRepository` in App 3 are Spring Data
repositories. You define an interface with method names and Spring writes the SQL query for you.  
Read: [Baeldung — Spring Data Repositories](https://www.baeldung.com/spring-data-repositories)

**2.3 — Custom Queries with JPQL and @Query**  
Some queries can't be expressed with method names alone. `findUnmatched()` and
`findByStatusAndSubmittedAtAfter()` in App 3 need `@Query`.  
Read: [Baeldung — Spring Data JPA @Query](https://www.baeldung.com/spring-data-jpa-query)

**2.4 — Spring JDBC Template**  
App 1's `LoanItemReader` uses `JdbcCursorItemReader` which is built on raw JDBC, not JPA.
You need to understand how Spring JDBC works directly.  
Read: [Baeldung — Spring JDBC](https://www.baeldung.com/spring-jdbc-jdbctemplate)  
Read: [Baeldung — ResultSet RowMapper](https://www.baeldung.com/spring-jdbc-jdbctemplate) (section on RowMapper)

**2.5 — Multiple DataSources**  
All three apps connect to two databases: the ERP database and their own schema/database.
This is the dual DataSource setup.  
Read: [Baeldung — Multiple DataSources with Spring Data JPA](https://www.baeldung.com/spring-data-jpa-multiple-databases)

**2.6 — Flyway Database Migrations**  
App 3 uses Flyway to manage the `bank_feed` schema. Flyway runs SQL migration scripts in order
and tracks which ones have been applied.  
Read: [Baeldung — Database Migrations with Flyway](https://www.baeldung.com/database-migrations-with-flyway)

> **Practice task (App 3 specific):**  
> After reading 2.1–2.3, write the `BankTransaction` JPA entity from App 3 Step 2.  
> Do not copy it — read the SQL schema in Step 2 and translate it into a Java `@Entity` class
> field by field. Map `NUMERIC(18,2)` to `BigDecimal`. Map `UUID` to `UUID`.  
> Map `CHAR(2)` with CHECK constraint to an `enum` with `@Enumerated(EnumType.STRING)`.  
> This exercise teaches you: how SQL types map to Java types, how constraints become annotations.

### Build Immediately After Phase 2

- **App 1 Step 2** — `DataSourceConfig.java` (dual datasource)
- **App 1 Step 3** — `LoanItemReader.java` (the JDBC cursor reader — you'll understand every line now)
- **App 3 Step 2** — Write the Flyway migration SQL and the `BankTransaction` JPA entity

---

## PHASE 3 — REST Clients and Retry

> The apps write results back to Django via HTTP. This is the same concept across all three apps.  
> Once you learn it here, you apply the same pattern three times.  
> Time: ~3–4 days.

### Study List

**3.1 — RestTemplate**  
`DjangoInternalApiClient` in App 1 and `DjangoReconciliationClient` in App 3 use RestTemplate.
This is the standard synchronous HTTP client in Spring.  
Read: [Baeldung — The Guide to RestTemplate](https://www.baeldung.com/rest-template)

**3.2 — HTTP Headers and Bearer Tokens**  
Every write-back call to Django sends `Authorization: Bearer <token>`.  
Read: [Baeldung — RestTemplate with Headers](https://www.baeldung.com/spring-rest-template-headers-content-type)

**3.3 — ResponseEntity and Status Codes**  
The write-back methods check `response.getStatusCode().is2xxSuccessful()`. Understanding
ResponseEntity is required for this.  
Read: [Baeldung — Spring RestTemplate — ResponseEntity](https://www.baeldung.com/spring-resttemplate-post-json)

**3.4 — Spring Retry**  
`DjangoInternalApiClient.postBulkAccruals()` uses `@Retryable`. When Django is temporarily
slow, the call retries automatically with exponential backoff.  
Read: [Baeldung — Guide to Spring Retry](https://www.baeldung.com/spring-retry)

**3.5 — Exception Handling**  
`BatchWriteException` in App 1 is a custom exception. You need to understand checked vs
unchecked exceptions and when to throw your own.  
Read: [Baeldung — Exception Handling in Java](https://www.baeldung.com/java-exceptions)

> **Practice task:**  
> Write a `DjangoInternalApiClient` with a single method `postBatchRunSummary()` that:  
> - Creates an `HttpHeaders` object with a Bearer token from a `String serviceToken` field
> - Makes a `POST` to `http://localhost:8000/api/internal/batch/run-summary/` with a
>   hardcoded JSON body `{"status": "completed", "loans_processed": 100}`
> - Logs the response status code  
> - Has `@Retryable(maxAttempts = 3)` on the method  
> You are building the real `LoanBatchListener.java` write-back from App 1 Step 8.

### Build Immediately After Phase 3

- **App 1 Step 6** — `DjangoInternalApiClient.java` and `LoanItemWriter.java`
- **App 2 Step 2** — `DjangoPayrollClient.java` and `FilingConfirmationClient.java`
- **App 3 Step 7** — `DjangoReconciliationClient.java`

---

## PHASE 4 — Spring Batch (App 1 Focused)

> This phase is for App 1 specifically. Spring Batch concepts are deep and specific.  
> But after you learn it here, you will understand exactly why it was chosen over Celery,  
> and you can explain that in an interview with technical precision.  
> Time: ~1.5 weeks.

### Study List

**4.1 — What Spring Batch Is and How It Thinks**  
Spring Batch has three core concepts: `Job` → `Step` → (`ItemReader` → `ItemProcessor` → `ItemWriter`).
Every Step processes data in chunks. You MUST understand chunks before any other Batch concept.  
Read: [Baeldung — Introduction to Spring Batch](https://www.baeldung.com/introduction-to-spring-batch)  
Read: [Baeldung — Spring Batch Architecture](https://www.baeldung.com/spring-batch-architecture)

**4.2 — ItemReader: Reading Data**  
`JdbcCursorItemReader` reads rows one at a time from a database cursor — exactly what
`LoanItemReader` does in App 1 Step 3.  
Read: [Baeldung — Reading from a Database with Spring Batch](https://www.baeldung.com/spring-batch-itemreader-database)

**4.3 — ItemProcessor: Applying Business Logic**  
`LoanItemProcessor` in App 1 takes a `LoanAccount`, applies the risk/accrual/provision
rules, and returns an `AccrualEntry`. This is the `ItemProcessor` contract.  
Read: [Baeldung — Spring Batch ItemProcessor](https://www.baeldung.com/spring-batch-item-processor)

**4.4 — ItemWriter: Writing Results**  
`LoanItemWriter` takes a chunk of `AccrualEntry` objects and posts them to Django.
The chunk (list of items) is exactly what `ItemWriter.write(Chunk<> items)` receives.  
Read: [Baeldung — Spring Batch ItemWriter](https://www.baeldung.com/spring-batch-item-writer)

**4.5 — Chunk-Oriented Processing (the most important concept)**  
Chunk size is why Spring Batch can restart from a checkpoint. Each chunk is a separate
transaction in the `JobRepository`. This is what you cannot replicate in Celery.  
Read: [Baeldung — Chunk-Oriented Processing in Spring Batch](https://www.baeldung.com/spring-batch-tasklet-chunk)

**4.6 — The JobRepository and Restart**  
The `JobRepository` records every chunk in the `BATCH_JOB_EXECUTION` and
`BATCH_STEP_EXECUTION` tables. A restarted job skips already-completed chunks automatically.  
Read: [Baeldung — Spring Batch Job Repository](https://www.baeldung.com/spring-batch-jobrepository-jobexplorer)

**4.7 — Fault Tolerance: Skip and Retry in a Step**  
`App 1 Step 7` uses `.faultTolerant().skip(LoanProcessingException.class).skipLimit(50)`.
This means up to 50 corrupt loan records are skipped without stopping the whole job.  
Read: [Baeldung — Skip Logic in Spring Batch](https://www.baeldung.com/spring-batch-skip-logic)

**4.8 — JobExecutionListener**  
`LoanBatchListener` in App 1 Step 8 implements `JobExecutionListener` with `afterJob()`.
This is where the failure alert and Django write-back happen.  
Read: [Baeldung — Spring Batch Listeners](https://www.baeldung.com/spring-batch-listeners)

**4.9 — @StepScope**  
`LoanItemReader.loanReader()` is annotated with `@StepScope`. This means a new instance
is created per Step execution (so state is not shared between runs).  
Read: [Baeldung — Spring Batch StepScope](https://www.baeldung.com/spring-batch-step-scope)

> **Practice task — build the whole App 1 inner loop:**  
> Create a mock version of `LoanItemProcessor` that:  
> - Takes a `LoanAccount` with fields: `id`, `daysInArrears`, `outstandingBalance`
> - Uses `RiskClassificationEngine.classify()` to get the risk tier
> - Uses `ProvisioningRuleEngine.calculateProvision()` to compute the provision amount
> - Returns an `AccrualEntry` with `loanId`, `newRiskClassification`, `provisionAmount`  
>   
> Then write a unit test that feeds 5 `LoanAccount` objects with different `daysInArrears` values
> (0, 35, 95, 190, 400) and asserts the returned `RiskClassification` is what CBN requires.  
> This IS the `RiskClassificationEngineTest` from App 1's completion checklist.
> You are writing a real test for a real regulatory requirement.

### Build Immediately After Phase 4

- **App 1 Step 4** — `RiskClassificationEngine`, `ProvisioningRuleEngine`, `InterestAccrualEngine`
- **App 1 Step 5** — `InterestAccrualEngine` (daily accrual by interest method)
- **App 1 Step 7** — `BatchConfig.java` (the full Job/Step wiring)
- **App 1 Step 8** — `LoanBatchListener.java`

> After Phase 4, App 1 is functionally complete. You have a working Spring Batch job
> that processes loans, classifies risk, computes accruals, and writes back to Django.

---

## PHASE 5 — Scheduling, Events, and Service Communication

> This phase unlocks the scheduling parts of all three apps and the event trigger
> mechanism in App 2. Time: ~4–5 days.

### Study List

**5.1 — @Scheduled: Running Code on a Timer**  
`DeadlineAlertService` in App 2 and `BalanceFeedService` in App 3 use `@Scheduled`.
The cron expression `"0 0 8 8 * ?"` means "8:00 AM on the 8th of every month".  
Read: [Baeldung — Scheduling Tasks with Spring](https://www.baeldung.com/spring-scheduled-tasks)  
Read: [Baeldung — Cron Expressions](https://www.baeldung.com/cron-expressions)

**5.2 — Quartz Scheduler**  
App 1 Step 10 uses Quartz instead of `@Scheduled` because Quartz persists its schedule
in a database — meaning if the app restarts, the next scheduled run is not lost.  
`@Scheduled` is simpler but in-memory only. For the nightly loan batch, losing a run
because the app restarted is unacceptable.  
Read: [Baeldung — Introduction to Quartz](https://www.baeldung.com/quartz)  
Read: [Baeldung — Spring Scheduling — Quartz vs @Scheduled](https://www.baeldung.com/spring-quartz-schedule)

**5.3 — Application Events**  
App 2 Option B (the outbox pattern) uses Spring events. Understanding
`ApplicationEventPublisher` and `@EventListener` is background knowledge here.  
Read: [Baeldung — Spring Events](https://www.baeldung.com/spring-events)

**5.4 — Caching with @Cacheable**  
`ConsentVerificationService` in App 3 Step 8 uses `@Cacheable` to avoid calling Django
on every poll cycle.  
Read: [Baeldung — Spring Cache](https://www.baeldung.com/spring-cache-tutorial)

> **Practice task:**  
> Write a `DeadlineAlertService` class with a `@Scheduled(cron = "0 0 8 8 * ?")` method
> that prints: `"Checking PAYE filing for: [previous month]"` to the console.  
> Run it. Observe that Spring calls it automatically.  
> Then change the cron to `"*/10 * * * * ?"` (every 10 seconds) to test it fires without
> waiting until the 8th.  
> This is the exact class from App 2 Step 9 — you just wrote a real part of the compliance service.

### Build Immediately After Phase 5

- **App 1 Step 10** — `QuartzConfig.java` (nightly schedule)
- **App 2 Step 5** — The Django trigger mechanism (Celery task in Django, webhook in Java)
- **App 2 Step 9** — `DeadlineAlertService.java`
- **App 2 Step 10** — `FilingRetryService.java`
- **App 3 Step 5** — `BankPollingOrchestrator.java` (the `@Scheduled` polling loop)
- **App 3 Step 9** — `BalanceFeedService.java`

---

## PHASE 6 — File Generation: Excel, PDF, and CSV

> This phase is for App 2 specifically: generating PAYE schedules and pension files.  
> The Excel and CSV knowledge is standalone — you can learn it in parallel with Phase 5.  
> Time: ~1 week.

### Study List

**6.1 — Apache POI: Writing Excel Files**  
`PayeScheduleGenerator` in App 2 Step 4 creates an Excel workbook row by row using POI.
`Workbook` → `Sheet` → `Row` → `Cell` is the hierarchy.  
Read: [Baeldung — Microsoft Excel with Apache POI](https://www.baeldung.com/java-microsoft-excel)

**6.2 — Apache POI Cell Styles and Number Formats**  
App 2 Step 4 creates a `monetaryStyle` and applies it to monetary cells. Without the
correct number format, FIRS's validation will reject the file.  
Read: [Baeldung — Formatting Cells in Apache POI](https://www.baeldung.com/apache-poi-cell-format)

**6.3 — Writing CSV in Java**  
The pension schedule in App 2 Step 6 is a CSV file, not Excel. Java has no built-in CSV
library — you build the string manually or use Apache Commons CSV.  
Read: [Baeldung — Reading and Writing CSVs in Java](https://www.baeldung.com/java-csv)

**6.4 — Writing a Byte Array and Returning a File**  
`generateExcelSchedule()` returns `byte[]` — the raw bytes of the Excel file.
Understanding `ByteArrayOutputStream` is required.  
Read: [Baeldung — ByteArrayOutputStream in Java](https://www.baeldung.com/java-bytearrayoutputstream)

**6.5 — YAML Configuration Binding (@ConfigurationProperties)**  
`cbn-provisioning-rules.yml` and `tax-bands.yml` are loaded into Java objects using
`@ConfigurationProperties`. This is how you externalise rules that change annually.  
Read: [Baeldung — @ConfigurationProperties in Spring Boot](https://www.baeldung.com/configuration-properties-in-spring-boot)

> **Practice task — the most valuable exercise in this roadmap:**  
> Take one real employee payslip (invent the data):  
>   - Name: Adaeze Okafor
>   - Basic: ₦150,000/month, Housing: ₦50,000, Transport: ₦30,000
>   - Gross monthly: ₦230,000 → Annual gross: ₦2,760,000
>
> Manually calculate the PAYE step by step using the tax bands from `tax-bands.yml`:  
>   - First ₦300,000 × 7% = ₦21,000  
>   - Next ₦300,000 × 11% = ₦33,000  
>   - Next ₦500,000 × 15% = ₦75,000  
>   - Next ₦500,000 × 19% = ₦95,000  
>   - Remaining ₦1,160,000 × 21% = ₦243,600  
>   - Total annual PAYE: ₦467,600 → Monthly: ₦38,967  
>
> Now write a `TaxBandCalculator` Java class that produces the same result.  
> Then write `PayeScheduleGeneratorTest.java` that uses this as a golden test case.  
> This is one of the tests explicitly required in the App 2 completion checklist.  
> You will now know with certainty that your PAYE calculator is correct —  
> before it ever generates a real filing.

### Build Immediately After Phase 6

- **App 2 Step 4** — `PayeScheduleGenerator.java` (Excel schedule)
- **App 2 Step 5** — `tax-bands.yml` and `@ConfigurationProperties` loading
- **App 2 Step 6** — `PensionScheduleGenerator.java` (CSV with UTF-8 BOM)

---

## PHASE 7 — Spring Integration and Circuit Breakers

> This phase is for App 3 specifically: the bank polling daemon.  
> Spring Integration is a large topic — focus only on the concepts used in App 3.  
> Time: ~1 week.

### Study List

**7.1 — What Spring Integration Is (the core idea)**  
Spring Integration connects systems using message channels. A bank poll result is a message.
It flows through a channel into a processor, then into a writer. Think of it as a pipeline.  
Read: [Baeldung — Introduction to Spring Integration](https://www.baeldung.com/spring-integration)

**7.2 — Message Channels and Polling**  
`BankPollingOrchestrator` in App 3 Step 5 runs a polling loop with `@Scheduled`.
Spring Integration's `PollingConsumer` formalises this pattern.  
Read: [Baeldung — Spring Integration Java DSL](https://www.baeldung.com/spring-integration-java-dsl)

**7.3 — Resilience4j Circuit Breakers**  
`@CircuitBreaker(name = "gtbank")` in `GtbankConnector` Step 4 is Resilience4j.  
When GTBank's API fails 5 times in a row, the circuit breaker "opens" — further calls
return the fallback immediately without hitting the API.  
Read: [Baeldung — Guide to Resilience4j](https://www.baeldung.com/resilience4j)  
Read: [Baeldung — Resilience4j with Spring Boot](https://www.baeldung.com/spring-boot-resilience4j)

**7.4 — @Cacheable and Cache Eviction**  
`ConsentVerificationService` in App 3 Step 8 uses `@Cacheable` with `@CacheEvict`.  
You studied this briefly in Phase 5.4. Now read it again with App 3 in mind.  
Read: [Baeldung — Spring Cache with @Cacheable and @CacheEvict](https://www.baeldung.com/spring-cache-tutorial)

**7.5 — The Levenshtein Distance Algorithm (for the matching engine)**  
`FuzzyReferenceMatcher` in App 3 Step 6 uses Levenshtein distance to compare bank narrations
to GL entries. You do not need to implement this algorithm — Apache Commons Text provides it.
But you do need to understand what "edit distance" means.  
Read: [Baeldung — String Similarity Algorithms](https://www.baeldung.com/java-string-similarity)

**7.6 — Partial Indexes and Query Optimisation (background knowledge)**  
App 3 Step 2 creates a partial index: `WHERE matched = FALSE`.
You do not need deep PostgreSQL knowledge, but you should understand why this is
significantly faster than a full-table scan for the `findUnmatched()` query.  
Read: [Baeldung — JPA and Database Indexes](https://www.baeldung.com/jpa-indexes) (for the Java side)

> **Practice task:**  
> Write `FuzzyReferenceMatcher.java` as a standalone class (no Spring needed).  
> Use Apache Commons Text `LevenshteinDistance`.  
> Test it with these pairs — predict the score before running:  
> - "PHOENIX TECH/INV-001" vs "PHEONIX TECH CONSULT / INV-2026-001 / PETER" → low similarity  
> - "PETER ADEMOYE SALARY" vs "PETER ADEMOYE SAL" → high similarity  
> - "GTB CHARGE" vs "BANK CHARGE GTB" → medium similarity  
>   
> Tune the similarity threshold in `matching-config.yml` until the test cases produce
> the right `HIGH` / `MEDIUM` / `LOW` classifications from App 3 Step 6.  
> You have now calibrated the matching engine with real test cases.

### Build Immediately After Phase 7

- **App 3 Step 3** — `BankConnector.java` interface
- **App 3 Step 4** — `GtbankConnector.java` (with circuit breaker and OAuth)
- **App 3 Step 5** — `BankPollingOrchestrator.java`
- **App 3 Step 6** — `TransactionMatcher.java`, `ExactAmountDateMatcher`, `FuzzyReferenceMatcher`
- **App 3 Step 8** — `ConsentVerificationService.java`

---

## PHASE 8 — Security Between Services

> This phase covers service-to-service authentication. Every app has it.  
> Learn it once. Apply it three times.  
> Time: ~3–4 days.

### Study List

**8.1 — What JWTs Are**  
JWT (JSON Web Token) is the format used for the service-to-service tokens.
It has three parts: header, payload, signature.  
Read: [Baeldung — Introduction to JWT](https://www.baeldung.com/java-json-web-tokens-jws)

**8.2 — Creating and Validating JWTs in Java**  
The service token is signed with HMAC-SHA256. You need to know how to create and verify it.  
Read: [Baeldung — JWT Authentication with Spring Security](https://www.baeldung.com/spring-security-oauth-jwt)  
Focus on: the token generation and validation part. You do not need the full OAuth flow.

**8.3 — Custom Authentication in Spring Security**  
`IsInternalServiceToken` is a custom Spring Security permission class that verifies the
incoming JWT on every call to the internal endpoints.  
Read: [Baeldung — Spring Security Custom Authentication](https://www.baeldung.com/spring-security-authentication-provider)

**8.4 — Environment Variables and Secret Management**  
The JWT signing secret must NOT be in `application.yml`. It comes from an environment variable.  
Read: [Baeldung — Spring Boot Environment Variables](https://www.baeldung.com/spring-boot-environmentpostprocessor)  
Read: [Baeldung — @Value Annotation](https://www.baeldung.com/spring-value-annotation)

> **Practice task:**  
> Write a `ServiceTokenGenerator` class that:  
> - Reads a secret key from `System.getenv("SERVICE_TOKEN_SECRET")`
> - Generates a JWT signed with HMAC-SHA256 with a 24-hour expiry  
> - Writes a `ServiceTokenVerifier` class that validates the token and throws if invalid  
>   
> Then add `ServiceTokenVerifier` to a Spring Security filter and test that your `postBulkAccruals()`
> endpoint (from Phase 3's practice task) returns 401 without the token and 200 with it.  
> You have now secured the internal API endpoint. This is the same pattern used in all three apps.

### Build Immediately After Phase 8

- **All apps** — `SecurityConfig.java` and the service token filter on all internal endpoints
- **App 2 Step 2** — Add the Bearer token to Django's `notify_compliance_service` Celery task
- **App 3 Step 4** — Add the GTBank OAuth token manager (separate from the service token)

---

## PHASE 9 — Testing, Observability, and Docker

> This phase is the difference between a project that works on your laptop  
> and one that is deployable and defensible in an interview or production environment.  
> Time: ~1 week.

### Study List

**9.1 — Unit Testing with JUnit 5 and Mockito**  
Every `*Test.java` file in the apps uses JUnit 5 and Mockito.
Mockito creates fake versions of dependencies so you can test one class in isolation.  
Read: [Baeldung — JUnit 5 Guide](https://www.baeldung.com/junit-5)  
Read: [Baeldung — Mockito Tutorial](https://www.baeldung.com/mockito-series)

**9.2 — Spring Batch Testing**  
Testing Spring Batch jobs requires `@SpringBatchTest` and `JobLauncherTestUtils`.  
Read: [Baeldung — Spring Batch Testing](https://www.baeldung.com/spring-batch-testing-job)

**9.3 — Testing REST Clients with MockRestServiceServer**  
`DjangoInternalApiClient` calls a real HTTP endpoint. In tests, you mock that endpoint
without running Django, using `MockRestServiceServer`.  
Read: [Baeldung — MockRestServiceServer](https://www.baeldung.com/spring-mock-rest-template)

**9.4 — Spring Boot Actuator Custom Endpoints**  
`BatchHealthEndpoint`, `FeedHealthEndpoint`, and `ComplianceHealthEndpoint` in the apps
are custom Actuator endpoints beyond `/actuator/health`.  
Read: [Baeldung — Custom Spring Boot Actuator Endpoints](https://www.baeldung.com/spring-boot-actuator-custom-endpoint)

**9.5 — Micrometer and Prometheus Metrics**  
`PollingMetrics` in App 3 exposes `transactions_pulled_total` etc. to Prometheus.
This is done via Micrometer, which Spring Boot integrates automatically.  
Read: [Baeldung — Micrometer with Spring Boot](https://www.baeldung.com/micrometer)

**9.6 — Dockerising a Spring Boot App**  
Every app has a `Dockerfile`. This is how you package the app for deployment.  
Read: [Baeldung — Dockerizing a Spring Boot Application](https://www.baeldung.com/dockerizing-spring-boot-application)

**9.7 — Multi-Stage Docker Builds**  
A production `Dockerfile` should not include the JDK — only the JRE. Multi-stage builds
compile in a builder stage and copy only the jar into a slim runtime image.  
Read: [Baeldung — Docker Multi-Stage Builds for Spring Boot](https://www.baeldung.com/spring-boot-docker-images)

> **Practice task:**  
> Write `RiskClassificationEngineTest.java` for App 1.  
> Test all five risk tiers with boundary values:  
> - 0 days → PERFORMING  
> - 29 days → PERFORMING (boundary)  
> - 30 days → WATCH  
> - 89 days → WATCH (boundary)  
> - 90 days → SUBSTANDARD  
> - 179 days → SUBSTANDARD (boundary)  
> - 180 days → DOUBTFUL  
> - 359 days → DOUBTFUL (boundary)  
> - 360 days → LOSS  
>   
> If your `RiskClassificationEngine` passes all 9 cases, you have correctly implemented
> CBN Prudential Guidelines Appendix 1. This is one of the explicit items in
> App 1's completion checklist. You are not just learning testing — you are satisfying a
> regulatory requirement through code.

### Build Immediately After Phase 9

- Write all `*Test.java` files listed in each app's completion checklist
- Write the `Dockerfile` for each app (multi-stage)
- Confirm each app's `/actuator/health` returns meaningful status
- Run `docker build` and `docker run` for App 1 to prove it is deployable

---

## Recommended Build Order — Putting It All Together

Follow this sequence after completing the phases. Each row is one deployable milestone.

| Milestone | Phases Required | What You Deploy |
|---|---|---|
| 1. App 1 core rules | 0, 2, 4 | `RiskClassificationEngine`, `ProvisioningRuleEngine`, `InterestAccrualEngine` — with tests passing |
| 2. App 1 full batch job | + 3 | Complete Spring Batch job reading from DB, processing, writing back to Django mock |
| 3. App 1 scheduler | + 5 | Quartz nightly schedule, failure alerting — App 1 is deployable |
| 4. App 2 tax calculator | 0, 6 | `TaxBandCalculator` with golden test, cross-validated against `payroll_service.py` |
| 5. App 2 file generators | + 6 | `PayeScheduleGenerator` and `PensionScheduleGenerator` producing real-format output |
| 6. App 2 full service | + 3, 5, 8 | Filing orchestration, deadline alerts, retry, Django write-back — App 2 is deployable |
| 7. App 3 connector interface | 0, 1, 7 | `BankConnector` interface + one mock `TestBankConnector` that returns fake transactions |
| 8. App 3 matching engine | + 0 (streams) | `TransactionMatcher` with `ExactAmountDateMatcher`, `FuzzyReferenceMatcher` — with tuned thresholds |
| 9. App 3 full daemon | + 2, 3, 5, 7, 8 | Full polling loop, matching, Django write-back, consent check — App 3 is deployable |
| 10. All apps secured and observable | + 9 | JWT service tokens, Actuator health, Prometheus metrics, Docker images |

---

## Keeping Track of What You Know vs What You Are Building

After each phase, check the boxes below. This is your progress tracker.

### Foundations
- [ ] Phase 0 — Can read and write Java: classes, interfaces, enums, BigDecimal, streams
- [ ] Phase 1 — Can scaffold and run a Spring Boot app with Actuator health endpoint
- [ ] Phase 2 — Can read from PostgreSQL with JDBC and JPA, can configure dual datasource
- [ ] Phase 3 — Can call a REST API from Java, handle responses, retry on failure

### App 1 Specific
- [ ] Phase 4 — Understand Spring Batch Job → Step → Reader → Processor → Writer → Chunk
- [ ] App 1 Milestone 1 — All three rule engines written and tested
- [ ] App 1 Milestone 2 — Full batch job runs end to end with mock Django endpoint
- [ ] App 1 Milestone 3 — Job scheduled, failure alerts wired, Docker image builds

### App 2 Specific
- [ ] Phase 5 — @Scheduled and Quartz understood and working
- [ ] Phase 6 — Apache POI Excel, CSV with BOM, @ConfigurationProperties for YAML
- [ ] App 2 Milestone 4 — PAYE calculator produces correct result for known inputs
- [ ] App 2 Milestone 5 — Excel and CSV files generated in correct format
- [ ] App 2 Milestone 6 — Full compliance service: triggered, files generated, submitted, confirmed

### App 3 Specific
- [ ] Phase 7 — Circuit breakers, Spring Integration polling, Levenshtein matching
- [ ] App 3 Milestone 7 — BankConnector interface + test connector returning mock transactions
- [ ] App 3 Milestone 8 — Matching engine tuned with real test cases, accuracy verified
- [ ] App 3 Milestone 9 — Full daemon: polling, matching, writing back to Django

### Cross-Cutting
- [ ] Phase 8 — Service-to-service JWT: can generate, sign, and verify tokens
- [ ] Phase 9 — All test suites passing, Docker images building, Actuator metrics exposed

---

## Quick Reference — Baeldung Pages You Will Return to Most Often

| Topic | URL |
|---|---|
| BigDecimal operations | https://www.baeldung.com/java-bigdecimal-biginteger |
| Spring Batch introduction | https://www.baeldung.com/introduction-to-spring-batch |
| Spring Retry | https://www.baeldung.com/spring-retry |
| RestTemplate | https://www.baeldung.com/rest-template |
| @ConfigurationProperties | https://www.baeldung.com/configuration-properties-in-spring-boot |
| Spring Profiles | https://www.baeldung.com/spring-profiles |
| Flyway migrations | https://www.baeldung.com/database-migrations-with-flyway |
| Multiple DataSources | https://www.baeldung.com/spring-data-jpa-multiple-databases |
| Spring Cache | https://www.baeldung.com/spring-cache-tutorial |
| Resilience4j | https://www.baeldung.com/resilience4j |
| Apache POI Excel | https://www.baeldung.com/java-microsoft-excel |
| JUnit 5 | https://www.baeldung.com/junit-5 |
| Mockito | https://www.baeldung.com/mockito-series |
| Docker + Spring Boot | https://www.baeldung.com/dockerizing-spring-boot-application |
| JWT in Java | https://www.baeldung.com/java-json-web-tokens-jws |
| Cron expressions | https://www.baeldung.com/cron-expressions |
