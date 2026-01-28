"use strict";
/**
 * TTS Configuration Exports
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTS_CONSTANTS = exports.ttsTimeoutConfig = exports.ttsRetryConfig = exports.cartesiaConfig = void 0;
var cartesia_config_1 = require("./cartesia.config");
Object.defineProperty(exports, "cartesiaConfig", { enumerable: true, get: function () { return cartesia_config_1.cartesiaConfig; } });
var retry_config_1 = require("./retry.config");
Object.defineProperty(exports, "ttsRetryConfig", { enumerable: true, get: function () { return retry_config_1.ttsRetryConfig; } });
var timeout_config_1 = require("./timeout.config");
Object.defineProperty(exports, "ttsTimeoutConfig", { enumerable: true, get: function () { return timeout_config_1.ttsTimeoutConfig; } });
var tts_constants_1 = require("./tts.constants");
Object.defineProperty(exports, "TTS_CONSTANTS", { enumerable: true, get: function () { return tts_constants_1.TTS_CONSTANTS; } });
