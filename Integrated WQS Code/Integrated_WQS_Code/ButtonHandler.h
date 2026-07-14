#ifndef BUTTONHANDLER_H
#define BUTTONHANDLER_H

#include <Arduino.h>

class ButtonHandler {
public:
    ButtonHandler(uint8_t pin, unsigned long debounceDelay = 50, unsigned long longPressDelay = 2000);
    
    void begin();
    void update();

    bool isShortPressed();
    bool isLongPressed();

private:
    uint8_t _pin;
    unsigned long _debounceDelay;
    unsigned long _longPressDelay;

    bool _lastButtonState;
    unsigned long _buttonPressTime;
    bool _longPressHandled;

    bool _shortPressDetected;
    bool _longPressDetected;
};

#endif // BUTTONHANDLER_H
