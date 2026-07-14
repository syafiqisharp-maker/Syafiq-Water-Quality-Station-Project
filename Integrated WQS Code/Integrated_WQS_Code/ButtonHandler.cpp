#include "ButtonHandler.h"

ButtonHandler::ButtonHandler(uint8_t pin, unsigned long debounceDelay, unsigned long longPressDelay)
    : _pin(pin), _debounceDelay(debounceDelay), _longPressDelay(longPressDelay),
      _lastButtonState(HIGH), _buttonPressTime(0), _longPressHandled(false),
      _shortPressDetected(false), _longPressDetected(false) {
}

void ButtonHandler::begin() {
    pinMode(_pin, INPUT_PULLUP);
    _lastButtonState = digitalRead(_pin);
}

void ButtonHandler::update() {
    _shortPressDetected = false;
    _longPressDetected = false;

    int reading = digitalRead(_pin);
    unsigned long currentMillis = millis();

    if (reading == LOW && _lastButtonState == HIGH) {
        // Button pressed down (Falling edge)
        _buttonPressTime = currentMillis;
        _longPressHandled = false;
    }

    if (reading == LOW && !_longPressHandled) {
        // Check for long press
        if ((currentMillis - _buttonPressTime) >= _longPressDelay) {
            _longPressHandled = true;
            _longPressDetected = true;
        }
    }

    if (reading == HIGH && _lastButtonState == LOW) {
        // Button released (Rising edge)
        if (!_longPressHandled && (currentMillis - _buttonPressTime) > _debounceDelay) {
            _shortPressDetected = true;
        }
    }

    _lastButtonState = reading;
}

bool ButtonHandler::isShortPressed() {
    return _shortPressDetected;
}

bool ButtonHandler::isLongPressed() {
    return _longPressDetected;
}
