# ESP32 TCS34725 Hue Scaling Calibration Prompt

**Context:**
I am writing C++ firmware for an ESP32 Dev Module using the standard Adafruit_TCS34725 library. We are measuring the color of translucent pond water under varying ambient light. 

**Task:**
Write a dedicated function that reads the raw data from the sensor, applies a "Luminance Hue Scaling" algorithm, and returns a standard Hexadecimal color string (e.g., `#E6FFC7`).

**The Math / Algorithm Steps:**
1. Retrieve the raw 16-bit values for R, G, B, and Clear from the sensor.
2. Implement a fail-safe: If all raw RGB values are 0 (e.g., pitch black or sensor error), return `#000000` immediately to avoid division-by-zero crashes.
3. Find the maximum value among the raw R, G, and B variables. Let's call this `max_val`.
4. Calculate a floating-point multiplier to scale that dominant color up to 255. 
   Formula: `Multiplier = 255.0 / max_val`
5. Multiply the raw R, G, and B values by this multiplier, and cast/round them into standard 8-bit integers (`uint8_t`).
6. Format these three 8-bit integers into a standard 6-character uppercase Hex string, prefixed with a `#`.

**Output format:** Please provide just the function code. Ensure it is heavily commented so I can understand the mathematical transformations taking place.
