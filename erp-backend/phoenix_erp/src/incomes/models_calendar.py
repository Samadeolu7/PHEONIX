# incomes/models_calendar.py
"""
Academic Calendar Models for School ERP
Flexible term/semester management for various school systems
"""
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager


class AcademicYear(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Define academic years with flexible term dates
    Supports various educational systems (trimester, semester, quarter)
    """
    
    name = models.CharField(
        max_length=50,
        help_text="e.g., '2025-2026' or 'Fall 2025'"
    )
    code = models.CharField(
        max_length=20,
        db_index=True,
        help_text="e.g., 'AY2025' or 'AY2025-2026'"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    
    is_active = models.BooleanField(
        default=False,
        help_text="Only one academic year should be active at a time"
    )
    
    # Configuration
    term_system = models.CharField(
        max_length=20,
        choices=[
            ('trimester', 'Trimester (3 terms)'),
            ('semester', 'Semester (2 terms)'),
            ('quarter', 'Quarter (4 terms)'),
        ],
        default='trimester',
        help_text="How the year is divided"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-start_date']
        verbose_name = 'Academic Year'
        verbose_name_plural = 'Academic Years'
        unique_together = [('owner', 'code')]  # Academic years span branches
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['start_date', 'end_date']),
        ]
    
    def __str__(self):
        return self.name
    
    def clean(self):
        super().clean()
        
        # Validate date range
        if self.end_date and self.start_date >= self.end_date:
            raise ValidationError("End date must be after start date")
        
        # Ensure only one active academic year per branch
        if self.is_active:
            conflicting = AcademicYear.objects.filter(
                branch=self.branch,
                is_active=True
            ).exclude(pk=self.pk)
            
            if conflicting.exists():
                raise ValidationError(
                    f"Academic year '{conflicting.first().name}' is already active. "
                    "Only one academic year can be active at a time."
                )
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class AcademicTerm(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Define flexible terms/semesters within academic years
    Handles Nigerian system where term dates vary
    """
    
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='terms'
    )
    
    name = models.CharField(
        max_length=50,
        help_text="e.g., 'First Term', 'Fall Semester'"
    )
    code = models.CharField(
        max_length=20,
        help_text="e.g., 'T1', 'FALL'"
    )
    
    TERM_CHOICES = [
        ('first', 'First Term'),
        ('second', 'Second Term'),
        ('third', 'Third Term'),
        ('fall', 'Fall Semester'),
        ('spring', 'Spring Semester'),
        ('summer', 'Summer Semester'),
        ('q1', 'First Quarter'),
        ('q2', 'Second Quarter'),
        ('q3', 'Third Quarter'),
        ('q4', 'Fourth Quarter'),
    ]
    term_number = models.CharField(
        max_length=20,
        choices=TERM_CHOICES,
        help_text="Standard term identifier"
    )
    
    # Flexible dates
    start_date = models.DateField()
    end_date = models.DateField()
    
    # Invoice configuration
    invoice_generation_date = models.DateField(
        null=True,
        blank=True,
        help_text="When to automatically generate invoices for this term"
    )
    payment_due_date = models.DateField(
        help_text="Default payment due date for this term"
    )
    
    # Holidays/Breaks
    has_mid_term_break = models.BooleanField(default=False)
    mid_term_break_start = models.DateField(null=True, blank=True)
    mid_term_break_end = models.DateField(null=True, blank=True)
    
    # Status
    is_active = models.BooleanField(
        default=False,
        help_text="Currently active term"
    )
    invoices_generated = models.BooleanField(
        default=False,
        help_text="Whether invoices have been generated for this term"
    )
    
    # Metadata for custom fields
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional term-specific data"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['academic_year', 'start_date']
        unique_together = ['academic_year', 'term_number']
        verbose_name = 'Academic Term'
        verbose_name_plural = 'Academic Terms'
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['start_date', 'end_date']),
            models.Index(fields=['invoice_generation_date']),
        ]
    
    def __str__(self):
        return f"{self.academic_year.name} - {self.name}"
    
    def clean(self):
        super().clean()
        
        # Validate date range
        if self.end_date and self.start_date >= self.end_date:
            raise ValidationError("End date must be after start date")
        
        # Validate term is within academic year
        if self.academic_year_id:
            if self.start_date < self.academic_year.start_date:
                raise ValidationError("Term start date cannot be before academic year start")
            if self.end_date > self.academic_year.end_date:
                raise ValidationError("Term end date cannot be after academic year end")
        
        # Validate mid-term break
        if self.has_mid_term_break:
            if not (self.mid_term_break_start and self.mid_term_break_end):
                raise ValidationError("Mid-term break requires both start and end dates")
            if self.mid_term_break_end <= self.mid_term_break_start:
                raise ValidationError("Mid-term break end must be after start")
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
    
    @property
    def is_current(self):
        """Check if this is the current term"""
        today = timezone.now().date()
        return self.start_date <= today <= self.end_date
    
    @property
    def days_until_start(self):
        """Days until term starts (negative if started)"""
        today = timezone.now().date()
        return (self.start_date - today).days
    
    @property
    def days_until_end(self):
        """Days until term ends (negative if ended)"""
        today = timezone.now().date()
        return (self.end_date - today).days
