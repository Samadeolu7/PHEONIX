# Generated migration for student-specific fields and parent/guardian support

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0002_initial'),
    ]

    operations = [
        # Add student-specific fields
        migrations.AddField(
            model_name='client',
            name='admission_number',
            field=models.CharField(blank=True, db_index=True, help_text='Unique student admission/registration number', max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='admission_date',
            field=models.DateField(blank=True, help_text='Date of admission to institution', null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='class_name',
            field=models.CharField(blank=True, help_text="Current class/form (e.g., 'Grade 5', 'Form 2', 'Year 1')", max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='grade_level',
            field=models.CharField(blank=True, help_text='Academic level or year', max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='section',
            field=models.CharField(blank=True, help_text="Class section (e.g., 'A', 'B', 'Blue', 'Red')", max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='roll_number',
            field=models.CharField(blank=True, help_text='Roll/seat number in class', max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='academic_year',
            field=models.CharField(blank=True, help_text="Current academic year (e.g., '2025/2026')", max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='student_status',
            field=models.CharField(blank=True, choices=[('enrolled', 'Enrolled'), ('graduated', 'Graduated'), ('transferred', 'Transferred'), ('withdrawn', 'Withdrawn'), ('suspended', 'Suspended'), ('expelled', 'Expelled')], help_text='Academic status for students', max_length=20, null=True),
        ),
        
        # Add guardian/parent fields
        migrations.AddField(
            model_name='client',
            name='primary_guardian_name',
            field=models.CharField(blank=True, help_text='Name of primary parent/guardian', max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='primary_guardian_relationship',
            field=models.CharField(blank=True, choices=[('father', 'Father'), ('mother', 'Mother'), ('grandfather', 'Grandfather'), ('grandmother', 'Grandmother'), ('uncle', 'Uncle'), ('aunt', 'Aunt'), ('guardian', 'Legal Guardian'), ('other', 'Other')], max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='primary_guardian_phone',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='primary_guardian_email',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='primary_guardian_occupation',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='secondary_guardian_name',
            field=models.CharField(blank=True, help_text='Name of secondary parent/guardian', max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='secondary_guardian_relationship',
            field=models.CharField(blank=True, choices=[('father', 'Father'), ('mother', 'Mother'), ('grandfather', 'Grandfather'), ('grandmother', 'Grandmother'), ('uncle', 'Uncle'), ('aunt', 'Aunt'), ('guardian', 'Legal Guardian'), ('other', 'Other')], max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='secondary_guardian_phone',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='secondary_guardian_email',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='secondary_guardian_occupation',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        
        # Add medical/emergency fields
        migrations.AddField(
            model_name='client',
            name='blood_group',
            field=models.CharField(blank=True, choices=[('A+', 'A+'), ('A-', 'A-'), ('B+', 'B+'), ('B-', 'B-'), ('AB+', 'AB+'), ('AB-', 'AB-'), ('O+', 'O+'), ('O-', 'O-')], max_length=10, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='allergies',
            field=models.TextField(blank=True, help_text='Known allergies', null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='medical_conditions',
            field=models.TextField(blank=True, help_text='Pre-existing medical conditions', null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='emergency_contact_name',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='emergency_contact_phone',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='client',
            name='emergency_contact_relationship',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        
        # Update ClientRelationship relationship_type choices to include parent/guardian types
        migrations.AlterField(
            model_name='clientrelationship',
            name='relationship_type',
            field=models.CharField(choices=[('spouse', 'Spouse'), ('parent', 'Parent'), ('child', 'Child'), ('sibling', 'Sibling'), ('father', 'Father'), ('mother', 'Mother'), ('guardian', 'Guardian'), ('grandfather', 'Grandfather'), ('grandmother', 'Grandmother'), ('uncle', 'Uncle'), ('aunt', 'Aunt'), ('cousin', 'Cousin'), ('emergency_contact', 'Emergency Contact'), ('business_partner', 'Business Partner'), ('employer', 'Employer'), ('employee', 'Employee'), ('other', 'Other')], max_length=50),
        ),
    ]
