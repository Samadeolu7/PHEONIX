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


def validate_attendance_location(branch, user_latitude, user_longitude, max_distance_km=1.5):
    """
    Validate if user's location is within acceptable distance from branch.
    
    Args:
        branch: Branch instance with latitude/longitude
        user_latitude: User's current latitude
        user_longitude: User's current longitude
        max_distance_km: Maximum allowed distance in kilometers (default: 1.5 km)
    
    Returns:
        tuple: (is_valid: bool, distance: float, message: str)
    
    Example:
        >>> branch = Branch(latitude=6.5244, longitude=3.3792)
        >>> is_valid, distance, msg = validate_attendance_location(branch, 6.5200, 3.3800)
        >>> is_valid
        True
        >>> f"{distance:.2f} km"
        '0.89 km'
    """
    # Check if branch has GPS coordinates
    if not branch.latitude or not branch.longitude:
        return True, 0, "Branch GPS coordinates not configured - location check skipped"
    
    # Check if user provided coordinates
    if not user_latitude or not user_longitude:
        return False, 0, "GPS coordinates required for attendance at this branch"
    
    try:
        # Calculate distance
        distance = calculate_distance(
            branch.latitude,
            branch.longitude,
            user_latitude,
            user_longitude
        )
        
        if distance <= max_distance_km:
            return True, distance, f"Location validated: {distance:.2f} km from branch"
        else:
            return False, distance, f"Too far from branch location: {distance:.2f} km (max: {max_distance_km} km)"
            
    except Exception as e:
        return False, 0, f"Location validation error: {str(e)}"
