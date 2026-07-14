#include <Wire.h>
#include "DFRobot_TCS34725.h"

// Initialize the sensor with default I2C (SDA=21, SCL=22 on standard ESP32)
// Integration time: 50ms, Gain: 4X as a good starting point for water
DFRobot_TCS34725 tcs = DFRobot_TCS34725(&Wire, TCS34725_ADDRESS, TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_4X);

// Helper function to estimate the color name from normalized RGB and Clear channel values.
// Note: Since color readings depend heavily on your lighting, distance, and container,
// you can adjust these reference coordinate thresholds to fine-tune the sensor to your setup.
// Threshold to check if the illumination is sufficient to trust the reading
const uint16_t MIN_TRUSTED_LUX = 10;

// Helper function to scale raw RGB values to a standard 0-255 range
// so the dominant color scales to 255 (Luminance Hue Scaling).
// Returns a 6-character hex string prefixed with '#' (e.g., "#E6FFC7").
String getScaledHexString(uint16_t r, uint16_t g, uint16_t b) {
  // Fail-safe: If all raw RGB values are 0, return "#000000" to avoid division by zero
  if (r == 0 && g == 0 && b == 0) {
    return "#000000";
  }

  // Find the maximum value among raw R, G, B
  uint16_t max_val = r;
  if (g > max_val) max_val = g;
  if (b > max_val) max_val = b;

  // Calculate the floating-point multiplier to scale the dominant color to 255
  float multiplier = 255.0 / (float)max_val;

  // Multiply and round raw values to standard 8-bit integers
  uint8_t scaled_r = (uint8_t)round((float)r * multiplier);
  uint8_t scaled_g = (uint8_t)round((float)g * multiplier);
  uint8_t scaled_b = (uint8_t)round((float)b * multiplier);

  // Format into a 6-character uppercase Hex string prefixed with '#'
  char hexStr[10];
  snprintf(hexStr, sizeof(hexStr), "#%02X%02X%02X", scaled_r, scaled_g, scaled_b);
  
  return String(hexStr);
}

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 Water Color Sensor (TCS34725) Initialization");

  // Wait for the sensor to be found
  while (tcs.begin() != 0) {
    Serial.println("No TCS34725 sensor found ... check your connections.");
    delay(1000);
  }
  
  Serial.println("TCS34725 sensor found successfully!");
  Serial.println("Send 'R' or 'r' in the Serial Monitor to take a reading.");
}

void loop() {
  // Check if Serial command is received
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    
    // Check if the command is 'R' or 'r'
    if (cmd == 'R' || cmd == 'r') {
      uint16_t clear, red, green, blue;
      
      // Read raw RGBC values
      tcs.getRGBC(&red, &green, &blue, &clear);
      
      // Wait for the sensor to finish reading
      tcs.lock();
      
      // Calculate color temperature and lux
      uint16_t colorTemp = tcs.calculateColortemperature(red, green, blue);
      uint16_t lux = tcs.calculateLux(red, green, blue);
      
      // Check if Lux is high enough to trust the reading
      bool isTrusted = (lux >= MIN_TRUSTED_LUX);
      
      // Generate scaled hex color code (if trusted, otherwise fallback to "#000000")
      String hexColor = isTrusted ? getScaledHexString(red, green, blue) : "#000000";

      // Print results to Serial Monitor
      Serial.println("===============================");
      Serial.print("Raw Red:   "); Serial.println(red);
      Serial.print("Raw Green: "); Serial.println(green);
      Serial.print("Raw Blue:  "); Serial.println(blue);
      Serial.print("Clear:     "); Serial.println(clear);
      Serial.print("Lux:       "); Serial.print(lux);
      if (isTrusted) {
        Serial.println(" (Trusted)");
      } else {
        Serial.println(" (UNTRUSTED - Too Low)");
      }
      Serial.print("Temp (K):  "); Serial.println(colorTemp);
      Serial.print("Hex Color: "); Serial.println(hexColor);
      Serial.println("===============================");
      Serial.println();
    }
    
    // Clear any extra characters (like newlines/carriage returns) from the buffer
    while (Serial.available() > 0) {
      Serial.read();
    }
  }
}
