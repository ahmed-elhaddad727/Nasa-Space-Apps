import pandas as pd
import numpy as np

def get_global_season(lat, month):
    """
    function to determine the season by latitude and month
    """
    if lat >= 0:
        if month in [12, 1, 2]: return 'winter'
        elif month in [3, 4, 5]: return 'spring'
        elif month in [6, 7, 8]: return 'summer'
        elif month in [9, 10, 11]: return 'fall'
    
    else:
        if month in [12, 1, 2]: return 'summer'
        elif month in [3, 4, 5]: return 'fall'
        elif month in [6, 7, 8]: return 'winter'
        elif month in [9, 10, 11]: return 'spring'

df['season'] = df.apply(lambda row: get_global_season(row['lat'], row['month']), axis=1)