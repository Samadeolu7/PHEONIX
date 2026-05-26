#!/usr/bin/env python
"""
Phoenix ERP Test Runner

Runs comprehensive tests and generates coverage reports.

Usage:
    python run_tests.py                     # Run all tests
    python run_tests.py accounts            # Run accounts app tests
    python run_tests.py --coverage          # Run with coverage report
    python run_tests.py --parallel          # Run tests in parallel
"""
import sys
import os
import subprocess
import argparse


class Colors:
    """ANSI color codes"""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_header(text):
    """Print colored header"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'=' * 70}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text.center(70)}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'=' * 70}{Colors.ENDC}\n")


def print_success(text):
    """Print success message"""
    print(f"{Colors.GREEN}✓ {text}{Colors.ENDC}")


def print_warning(text):
    """Print warning message"""
    print(f"{Colors.YELLOW}⚠ {text}{Colors.ENDC}")


def print_error(text):
    """Print error message"""
    print(f"{Colors.RED}✗ {text}{Colors.ENDC}")


def run_command(command, description):
    """Run a shell command and return exit code"""
    print(f"\n{Colors.BOLD}{description}...{Colors.ENDC}")
    print(f"Command: {' '.join(command)}\n")
    
    result = subprocess.run(command)
    
    if result.returncode == 0:
        print_success(f"{description} completed successfully")
    else:
        print_error(f"{description} failed with exit code {result.returncode}")
    
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description='Run Phoenix ERP tests')
    parser.add_argument('app', nargs='?', help='Specific app to test (e.g., accounts, transactions)')
    parser.add_argument('--coverage', action='store_true', help='Run with coverage report')
    parser.add_argument('--parallel', action='store_true', help='Run tests in parallel')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--failfast', '-f', action='store_true', help='Stop on first failure')
    parser.add_argument('--keepdb', '-k', action='store_true', help='Keep test database')
    
    args = parser.parse_args()
    
    # Build base command
    if args.coverage:
        cmd = ['coverage', 'run', '--source=.', 'manage.py', 'test']
    else:
        cmd = ['python', 'manage.py', 'test']
    
    # Add app if specified
    if args.app:
        cmd.append(args.app)
    
    # Add flags
    if args.parallel and not args.coverage:  # Coverage doesn't work well with parallel
        cmd.append('--parallel')
    
    if args.verbose:
        cmd.append('--verbosity=2')
    
    if args.failfast:
        cmd.append('--failfast')
    
    if args.keepdb:
        cmd.append('--keepdb')
    
    print_header("PHOENIX ERP TEST RUNNER")
    
    # Run tests
    exit_code = run_command(cmd, "Running tests")
    
    # Generate coverage report if requested
    if args.coverage and exit_code == 0:
        print("\n")
        run_command(['coverage', 'report'], "Generating coverage report")
        
        print("\n")
        run_command(['coverage', 'html'], "Generating HTML coverage report")
        
        print_success("HTML coverage report generated at: htmlcov/index.html")
    
    # Print summary
    print_header("TEST RUN SUMMARY")
    
    if exit_code == 0:
        print_success("All tests passed! ✨")
    else:
        print_error(f"Tests failed with exit code {exit_code}")
        print_warning("Review the errors above and fix the failing tests")
    
    # Print helpful commands
    print(f"\n{Colors.BOLD}Helpful commands:{Colors.ENDC}")
    print("  python run_tests.py accounts         # Test accounts app")
    print("  python run_tests.py --coverage       # Run with coverage")
    print("  python run_tests.py --parallel       # Run in parallel")
    print("  python run_tests.py -f               # Stop on first failure")
    print("  python run_tests.py -k               # Keep test database\n")
    
    return exit_code


if __name__ == '__main__':
    sys.exit(main())
