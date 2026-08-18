#ifndef PUMP_CONTROLLER_H
#define PUMP_CONTROLLER_H

#include <Arduino.h>
#include "Config.h"

class PumpController {
public:
    PumpController(uint8_t relayPin = PUMP_RELAY_PIN, uint8_t activeLevel = RELAY_ACTIVE_LEVEL);

    // Initialize the GPIO pin and turn pump ON to start the first cycle
    void begin();

    // Call inside the main loop for non-blocking timing and state transitions
    void update(unsigned long currentMillis);

    // True when the 5-second settling period completes (5m 05s mark)
    bool isSampleReady();
    void clearSampleReady();

    // Sensor Polling Permission (True ONLY after 30s of pump ON, until 5m pump OFF)
    bool isSensorPollingAllowed() const;
    bool isFilling() const;
    unsigned long getFillRemainingSeconds() const;

    // Current state and remaining countdown info
    PumpState getState() const;
    const char* getStateName() const;
    unsigned long getRemainingSeconds() const;
    void getCountdownString(char* buffer, size_t bufferSize) const;

    // Safety pause/resume for calibration modes
    void pause();
    void resume();

    // Manual controls (if needed for testing/diagnostics)
    void forceOn();
    void forceOff();

private:
    uint8_t _relayPin;
    uint8_t _activeLevel;
    PumpState _state;
    PumpState _stateBeforePause;

    unsigned long _stateStartTime;
    unsigned long _pausedAtTime;
    unsigned long _stateDuration;

    bool _sampleReady;

    void setRelay(bool turnOn);
    void transitionTo(PumpState newState, unsigned long currentMillis);
};

#endif // PUMP_CONTROLLER_H
