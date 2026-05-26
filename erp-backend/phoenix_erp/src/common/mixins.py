# common/mixins.py
"""
MakerCheckerMixin — enforces the four-eyes principle on critical financial actions.

Apply to any model method that represents an approval or confirmation step.
The mixin provides a reusable check: the person who initiated/created a record
cannot be the same person who approves or confirms it.
"""
from django.core.exceptions import ValidationError


class MakerCheckerMixin:
    """
    Mixin for model classes that must enforce maker-checker separation.

    Usage:
        class MyModel(MakerCheckerMixin, TimeStampedModel, ...):
            ...
            def approve(self, approving_user):
                self.assert_not_maker(approving_user, action="approve")
                ...

    The mixin looks for maker identity in:
      1. self.created_by  (the user who created the record)
      2. self.owner       (fallback if created_by is null)
    """

    def get_maker_id(self):
        """Return the PK of the 'maker' (record creator)."""
        if getattr(self, 'created_by_id', None):
            return self.created_by_id
        return getattr(self, 'owner_id', None)

    def assert_not_maker(self, acting_user, action: str = 'approve'):
        """
        Raise ValidationError if acting_user is the same as the maker.

        Args:
            acting_user: The User attempting the action.
            action:      Human-readable label for the error message (default 'approve').
        """
        maker_id = self.get_maker_id()
        if maker_id and acting_user.pk == maker_id:
            model_name = self.__class__.__name__
            raise ValidationError(
                f"Maker-checker violation: the person who created this "
                f"{model_name} cannot also {action} it. "
                f"A different user must perform this action."
            )
