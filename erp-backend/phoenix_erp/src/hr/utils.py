"""
HR Utility Functions

Provides helper functions for HR operations including GPS distance calculation
for attendance validation.
"""

from math import radians, cos, sin, asin, sqrt
from decimal import Decimal


def calculate_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points on earth (in kilometers)
    using the Haversine formula.
    
    Args:
        lat1: Latitude of first point (decimal degrees)
        lon1: Longitude of first point (decimal degrees)
        lat2: Latitude of second point (decimal degrees)
        lon2: Longitude of second point (decimal degrees)
    
    Returns:
        float: Distance in kilometers
    
    Example:
        >>> calculate_distance(6.5244, 3.3792, 6.5200, 3.3800)  # Lagos coordinates
        0.89  # approximately 890 meters
    """
    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(float, [lon1, lat1, lon2, lat2])
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    
    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    
    # Radius of earth in kilometers
    r = 6371
    
    return c * r


# Phones report how precise their fix is (the browser's ``coords.accuracy``,
# in meters). A staff member standing inside the office with a weak indoor
# fix can easily read as a few hundred meters away, so the reported accuracy
# is added to the branch radius — but only up to this cap, so a wildly
# imprecise (or spoofed "±5 km") reading can't stretch the fence to cover
# a whole city.
MAX_GPS_ACCURACY_ALLOWANCE_M = 300


def _to_float(value):
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def validate_attendance_location(branch, user_latitude, user_longitude,
                                 max_distance_km=None, accuracy_m=None):
    """
    Validate if user's location is within acceptable distance from branch.

    Args:
        branch: Branch instance with latitude/longitude and attendance_radius_meters
        user_latitude: User's current latitude
        user_longitude: User's current longitude
        max_distance_km: Maximum allowed distance in kilometers. Defaults to the
            branch's own configurable attendance_radius_meters (falls back to
            1.5 km for branches predating that field, e.g. in older migrations
            or tests that construct a bare Branch() without it).
        accuracy_m: The device's reported GPS accuracy in meters. Added to
            the allowed distance (capped at MAX_GPS_ACCURACY_ALLOWANCE_M) so
            phones with a less precise fix aren't wrongly rejected.

    Returns:
        tuple: (is_valid: bool, distance: float, message: str)

    Example:
        >>> branch = Branch(latitude=6.5244, longitude=3.3792, attendance_radius_meters=1000)
        >>> is_valid, distance, msg = validate_attendance_location(branch, 6.5200, 3.3800)
        >>> is_valid
        True
        >>> f"{distance:.2f} km"
        '0.89 km'
    """
    # Check if branch has GPS coordinates
    if branch is None or branch.latitude is None or branch.longitude is None:
        return True, 0, "Branch GPS coordinates not configured - location check skipped"

    lat = _to_float(user_latitude)
    lng = _to_float(user_longitude)
    if lat is None or lng is None:
        return False, 0, (
            "Your location is required to clock in/out at this branch. "
            "Allow location access in your browser and try again."
        )

    if max_distance_km is None:
        max_distance_km = (getattr(branch, 'attendance_radius_meters', None) or 1500) / 1000

    accuracy = _to_float(accuracy_m)
    allowance_km = 0.0
    if accuracy is not None and accuracy > 0:
        allowance_km = min(accuracy, MAX_GPS_ACCURACY_ALLOWANCE_M) / 1000

    try:
        distance = calculate_distance(branch.latitude, branch.longitude, lat, lng)
    except Exception as e:
        return False, 0, f"Location validation error: {str(e)}"

    allowed_km = max_distance_km + allowance_km
    if distance <= allowed_km:
        return True, distance, f"Location validated: {distance:.2f} km from branch"

    message = (
        f"You are {distance * 1000:.0f} m from {getattr(branch, 'name', 'the branch')}; "
        f"clock-in is allowed within {max_distance_km * 1000:.0f} m"
    )
    if allowance_km:
        message += f" (+{allowance_km * 1000:.0f} m for your phone's GPS accuracy)"
    message += "."
    if accuracy is not None and accuracy > MAX_GPS_ACCURACY_ALLOWANCE_M:
        message += (
            f" Your location is only accurate to about {accuracy:.0f} m — turn on "
            "GPS / high-accuracy location, move near a window, and try again."
        )
    return False, distance, message
