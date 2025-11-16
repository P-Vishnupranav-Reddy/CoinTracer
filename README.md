# Digital Asset and Cryptocurrency Portfolio Tracker

**Project ID:** P25  
**Course:** UE23CS341A  
**Academic Year:** 2025  
**Semester:** 5th Sem  
**Campus:** RR  
**Branch:** CSE  
**Section:** G  
**Team:** CoinTracer

## Project Description

A personal investment tracking application for cryptocurrencies and digital assets, featuring real-time price monitoring, portfolio performance analysis, and investment recommendations. This project involves API integration, financial calculations, and data visualization components.

This repository contains the source code and documentation for the Digital Asset and Cryptocurrency Portfolio Tracker project, developed as part of the UE23CS341A course at PES University.

## Development Team (CoinTracer)

- [@Prajwal-M-K](https://github.com/Prajwal-M-K) - Scrum Master
- [@P-Vishnupranav-Reddy](https://github.com/P-Vishnupranav-Reddy) - Developer Team
- [@night-fury-lab](https://github.com/night-fury-lab) - Developer Team

## Teaching Assistant

- [@dhruva1311](https://github.com/dhruva1311)
- [@aadhyadarshan](https://github.com/aadhyadarshan)

## Faculty Supervisor

- [@Sivagamasundari](https://github.com/Sivagamasundari)


## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- npm or yarn

### Installation
1. Clone the repository
   ```bash
   git clone https://github.com/pestechnology/PESU_RR_CSE_G_P25_Digital_Asset_and_Cryptocurrency_Portfolio_Tracker_CoinTracer.git
   cd PESU_RR_CSE_G_P25_Digital_Asset_and_Cryptocurrency_Portfolio_Tracker_CoinTracer
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Run the application
   ```bash
   npm run dev
   ```

## Project Structure

```
PESU_RR_CSE_G_P25_Digital_Asset_and_Cryptocurrency_Portfolio_Tracker_CoinTracer/
├── frontend/                    # React frontend application
├── user-service/                # User authentication and management
├── exchange-connections-service/# Portfolio and exchange integrations
├── market-data-service/         # Market data and price feeds
├── personalization-service/     # User preferences and favorites
├── shared/                      # Shared utilities and middleware
├── db/                          # Database schema and seeds
├── .github/                     # GitHub workflows and templates
└── README.md
```

## Development Guidelines

### Branching Strategy
- `main`: Production-ready code
- `develop`: Development branch
- `feature/*`: Feature branches
- `bugfix/*`: Bug fix branches

### Commit Messages
Follow conventional commit format:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test-related changes

### Code Review Process
1. Create feature branch from `develop`
2. Make changes and commit
3. Create Pull Request to `develop`
4. Request review from team members
5. Merge after approval

## Documentation

- [API Documentation](docs/api.md)
- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/developer-guide.md)

## Testing

### Quick Start
```bash
# Run all tests
npm run test:all

# Run tests with coverage
npm run test:coverage

# Run tests for specific service
cd user-service && npm test
cd market-data-service && npm test
cd exchange-connections-service && npm test
```

### Test Coverage
- **49 new test cases** added for recent features
- Comprehensive coverage for profile updates, asset details, and P&L calculations
- See [TESTING.md](TESTING.md) for detailed testing guide
- See [TEST_COVERAGE.md](TEST_COVERAGE.md) for coverage documentation

### CI/CD Integration
All tests run automatically on every push and pull request:
- Automated test execution
- Coverage reporting
- PR comments with results
- Quality gates and thresholds

See [CI_CD_INTEGRATION.md](CI_CD_INTEGRATION.md) for complete CI/CD documentation.

## License

This project is developed for educational purposes as part of the PES University UE23CS341A curriculum.

---

**Course:** UE23CS341A  
**Institution:** PES University  
**Academic Year:** 2025  
**Semester:** 5th Sem
