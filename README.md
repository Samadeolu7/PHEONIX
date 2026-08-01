# Phoenix — Microfinance Lending & Accounting Platform (Spring Boot)

A Spring Boot microservices platform modeling the core operations of a Nigerian microfinance
lending business, built as a personal deep-dive into production-grade Java backend architecture
following CBN (Central Bank of Nigeria) prudential guidelines.

## Services

- **Loan Portfolio Batch Processor** — Spring Batch 6 jobs for loan portfolio processing against
  a dual-datasource setup, aligned with CBN prudential reporting requirements. See
  `APP1_LOAN_PORTFOLIO_BATCH_PROCESSOR.md`.
- **Statutory Compliance Service** — handles Nigerian statutory/regulatory compliance reporting
  for a microfinance lending operation. See `APP2_STATUTORY_COMPLIANCE_SERVICE.md`.
- **Bank Feed Reconciliation Service** — reconciles bank transactions against internal ledgers
  using scheduled file-based feeds, with multi-branch account scoping. See
  `APP3_BANK_FEED_RECONCILIATION_SERVICE.md`.

## Stack

Java, Spring Boot, Spring Batch, dual-datasource JPA, React/TypeScript frontend (`erp-frontend`).

## Notes

This project was built to deepen hands-on experience with Java concurrency, Spring Batch,
and distributed-service patterns in a domain (microfinance lending) I work with in production
using Django. See the accompanying `GAP_ANALYSIS_REPORT.md` and `LEARNING_ROADMAP.md` for the
reasoning behind the architecture choices.
