#include "PumpController.h"

PumpController::PumpController(uint8_t relayPin, uint8_t activeLevel)
    : _relayPin(relayPin),
      _activeLevel(activeLevel),
      _state(PUMP_RUNNING),
      _stateBeforePause(PUMP_RUNNING),
      _stateStartTime(0),
      _pausedAtTime(0),
      _stateDuration(PUMP_RUN_DURATION_MS),
      _sampleReady(false) {}

void PumpController::begin() {
    pinMode(_relayPin, OUTPUT);
    
    // Start initial cycle: Turn pump ON for 5 minutes
    transitionTo(PUMP_RUNNING, millis());
    
    Serial.println(F("-> Pump Controller (HW-482): Initialized OK"));
    Serial.printf("   [GPIO %d | Active: %s]\n", _relayPin, (_activeLevel == HIGH) ? "HIGH" : "LOW");
    Serial.println(F("   Cycle: 5m Pumping -> 5s Settling & LoRa -> 4m55s Resting"));
}

void PumpController::update(unsigned long currentMillis) {
    if (_state == PUMP_PAUSED) {
        return;
    }

    unsigned long elapsed = currentMillis - _stateStartTime;

    switch (_state) {
    case PUMP_RUNNING:
        if (elapsed >= PUMP_RUN_DURATION_MS) {
            Serial.println(F("\n[PUMP] 5-Minute pumping completed. Turning pump OFF for 5s settling..."));
            transitionTo(PUMP_SETTLING, currentMillis);
        }
        break;

    case PUMP_SETTLING:
        if (elapsed >= PUMP_SETTLE_DURATION_MS) {
            Serial.println(F("[PUMP] 5s Settling completed. Triggering sensor sample & LoRa transmission!"));
            _sampleReady = true; // Signal main orchestrator to transmit LoRa
            transitionTo(PUMP_RESTING, currentMillis);
        }
        break;

    case PUMP_RESTING:
        if (elapsed >= PUMP_REST_DURATION_MS) {
            Serial.println(F("\n[PUMP] 10-Minute cycle complete. Restarting pump for next 5-minute cycle..."));
            transitionTo(PUMP_RUNNING, currentMillis);
        }
        break;

    default:
        break;
    }
}

void PumpController::transitionTo(PumpState newState, unsigned long currentMillis) {
    _state = newState;
    _stateStartTime = currentMillis;

    switch (_state) {
    case PUMP_RUNNING:
        _stateDuration = PUMP_RUN_DURATION_MS;
        setRelay(true);
        break;
    case PUMP_SETTLING:
        _stateDuration = PUMP_SETTLE_DURATION_MS;
        setRelay(false);
        break;
    case PUMP_RESTING:
        _stateDuration = PUMP_REST_DURATION_MS;
        setRelay(false);
        break;
    case PUMP_PAUSED:
        setRelay(false);
        break;
    }
}

void PumpController::setRelay(bool turnOn) {
    if (turnOn) {
        digitalWrite(_relayPin, _activeLevel);
    } else {
        digitalWrite(_relayPin, (_activeLevel == HIGH) ? LOW : HIGH);
    }
}

bool PumpController::isSampleReady() {
    return _sampleReady;
}

void PumpController::clearSampleReady() {
    _sampleReady = false;
}

bool PumpController::isSensorPollingAllowed() const {
    if (_state != PUMP_RUNNING) {
        return false;
    }
    unsigned long elapsed = millis() - _stateStartTime;
    return (elapsed >= PUMP_FILL_DELAY_MS);
}

bool PumpController::isFilling() const {
    if (_state != PUMP_RUNNING) {
        return false;
    }
    unsigned long elapsed = millis() - _stateStartTime;
    return (elapsed < PUMP_FILL_DELAY_MS);
}

unsigned long PumpController::getFillRemainingSeconds() const {
    if (!isFilling()) return 0;
    unsigned long elapsed = millis() - _stateStartTime;
    if (elapsed >= PUMP_FILL_DELAY_MS) return 0;
    return (PUMP_FILL_DELAY_MS - elapsed + 999U) / 1000U;
}

PumpState PumpController::getState() const {
    return _state;
}

const char* PumpController::getStateName() const {
    if (isFilling()) {
        return "FILL";
    }
    switch (_state) {
    case PUMP_RUNNING:  return "ON";
    case PUMP_SETTLING: return "SETTLE";
    case PUMP_RESTING:  return "OFF";
    case PUMP_PAUSED:   return "PAUSED";
    default:            return "UNKNOWN";
    }
}

unsigned long PumpController::getRemainingSeconds() const {
    unsigned long current = millis();
    unsigned long elapsed = 0;

    if (_state == PUMP_PAUSED) {
        elapsed = _pausedAtTime - _stateStartTime;
    } else {
        elapsed = current - _stateStartTime;
    }

    if (elapsed >= _stateDuration) {
        return 0;
    }
    return (_stateDuration - elapsed + 999U) / 1000U; // Round up
}

void PumpController::getCountdownString(char* buffer, size_t bufferSize) const {
    if (!buffer || bufferSize == 0) return;

    if (_state == PUMP_PAUSED) {
        snprintf(buffer, bufferSize, "PAUSE");
        return;
    }

    if (isFilling()) {
        unsigned long fillSec = getFillRemainingSeconds();
        snprintf(buffer, bufferSize, "%lus", fillSec);
        return;
    }

    unsigned long remSec = getRemainingSeconds();
    if (_state == PUMP_SETTLING) {
        snprintf(buffer, bufferSize, "%lus", remSec);
    } else {
        unsigned int minutes = remSec / 60;
        unsigned int seconds = remSec % 60;
        snprintf(buffer, bufferSize, "%02u:%02u", minutes, seconds);
    }
}

void PumpController::pause() {
    if (_state != PUMP_PAUSED) {
        _stateBeforePause = _state;
        _pausedAtTime = millis();
        _state = PUMP_PAUSED;
        setRelay(false);
        Serial.println(F("[PUMP] Paused for sensor calibration."));
    }
}

void PumpController::resume() {
    if (_state == PUMP_PAUSED) {
        unsigned long pauseDuration = millis() - _pausedAtTime;
        _stateStartTime += pauseDuration;
        _state = _stateBeforePause;
        setRelay(_state == PUMP_RUNNING);
        Serial.println(F("[PUMP] Resumed normal cycle from calibration."));
    }
}

void PumpController::forceOn() {
    setRelay(true);
}

void PumpController::forceOff() {
    setRelay(false);
}
