
// PID tính góc từ tốc độ, chỉ cần sử dụng PI
float speedPIControl(float DT, int16_t input, int16_t setPoint,  float Kp, float Ki)
{
  int16_t error;
  float output;

  error = setPoint - input;
  PID_errorSum += constrain(error, -ITERM_MAX_ERROR, ITERM_MAX_ERROR);
  PID_errorSum = constrain(PID_errorSum, -ITERM_MAX, ITERM_MAX);

  output = Kp * error + Ki * PID_errorSum * DT; // DT is in miliseconds...
  return (output);
}

// PID tính tốc độ động cơ, chỉ cần sử dụng PD
float stabilityPDControl(float DT, float input, float setPoint,  float Kp, float Kd)
{
  float error;
  float output;

  error = setPoint - input;

  float Kd_setPoint = constrain((setPoint - setPointOld), -8, 8);
  output = Kp * error + (Kd * Kd_setPoint - Kd * (input - PID_errorOld)) / DT;

  PID_errorOld = input;
  setPointOld = setPoint;
  return (output);
}


void ICACHE_RAM_ATTR runTimer(int type_step)
{
  if (type_step == 1) {
    while(ESP.getCycleCount() - t_step_1 < timer_period_1);
    t_step_1 = ESP.getCycleCount();
    digitalWrite(STEP_1, 1);
    steps1 -= dir_M1;
  } else if (type_step == 2) {
    while(ESP.getCycleCount() - t_step_2 < timer_period_2);
    t_step_2 = ESP.getCycleCount();
    digitalWrite(STEP_2, 1);
    steps2 -= dir_M2;
  }

  uint32_t t = ESP.getCycleCount();
  uint32_t t1 = timer_period_1 - (t - t_step_1);
  uint32_t t2 = timer_period_2 - (t - t_step_2);

  if (t1 > timer_period_1) t1 = 0;
  if (t2 > timer_period_2) t2 = 0;
    
  
  uint32_t t_min = 0;
  int8_t type = 0;

  if (t1 <= t2) {
    type = 1;
    t_min = t1;
  } else {
    type = 2;
    t_min = t2;
  }
  t_min = t + t_min - ESP.getCycleCount();
  if (t_min > ZERO_SPEED || t_min < 440) {
    runTimer(type);
  } else {
    timer1_write(t_min - 400);
    tickInterrupt = t_min - 400;
  }
  if (type_step == 1) {
    digitalWrite(STEP_1, 0);
  } else if (type_step == 2) {
    digitalWrite(STEP_2, 0);
  }
}

void ICACHE_RAM_ATTR interruptTimer()
{
  runTimer(type_step);
}


void setMotorSpeedM1(int16_t tspeed)
{
  if ((speed_M1 - tspeed) > MAX_ACCEL)
    speed_M1 -= MAX_ACCEL;
  else if ((speed_M1 - tspeed) < -MAX_ACCEL)
    speed_M1 += MAX_ACCEL;
  else
    speed_M1 = tspeed;

  if (speed_M1 == 0)
  {
    timer_period_1 = ZERO_SPEED;
    dir_M1 = 0;
  }
  else if (speed_M1 > 0)
  {
    timer_period_1 = 1600000 / speed_M1;
    dir_M1 = 1;
    digitalWrite(DIR_1, 0);
  }
  else
  {
    timer_period_1 = 1600000 / -speed_M1;
    dir_M1 = -1;
    digitalWrite(DIR_1, 1);
  }
}

void setMotorSpeedM2(int16_t tspeed)
{
  if ((speed_M2 - tspeed) > MAX_ACCEL)
    speed_M2 -= MAX_ACCEL;
  else if ((speed_M2 - tspeed) < -MAX_ACCEL)
    speed_M2 += MAX_ACCEL;
  else
    speed_M2 = tspeed;

  if (speed_M2 == 0)
  {
    timer_period_2 = ZERO_SPEED;
    dir_M2 = 0;
  }
  else if (speed_M2 > 0)
  {
    timer_period_2 = 1600000 / speed_M2;
    dir_M2 = 1;
    digitalWrite(DIR_2, 1);
  }
  else
  {
    timer_period_2 = 1600000 / -speed_M2;
    dir_M2 = -1;
    digitalWrite(DIR_2, 0);
  }
}

void updateStep() {
  if (min(timer_period_1, timer_period_2) < tickInterrupt) {
    timer1_write(min(timer_period_1, timer_period_2));
  }
}


byte *nextInt(byte *data) {
  while (data[0] == '-' || (data[0] >= '0' && data[0] <= '9')) {
    data++;
  }
  while (data[0] != '-' && (data[0] < '0' || data[0] > '9')) {
    data++;
  }
  return data;
}

int32_t stringToInt(byte *data) {
  int32_t s = 0;
  bool b = false;
  
  if (data[0] == '-') {
    b = true;
    data++;
  }
  while (data[0] >= '0' && data[0] <= '9') {
    s = s * 10 + data[0] - '0';
    data++;
  }
  return (b ? (0 - s) : s);
}

byte dataPacket[64];
void readUdp()
{
  int packetSize = Udp.parsePacket();
  if (packetSize) {
    int len = Udp.read(dataPacket, 64);
    dataPacket[len] = 0;
    
    ipRemote = Udp.remoteIP();
    portRemote = Udp.remotePort();
    
    byte *data = dataPacket;
    
    int type = stringToInt(data);
    switch (type) {
      case 1: {
        data = nextInt(data);
        int th = stringToInt(data);
        data = nextInt(data);
        int st = stringToInt(data);
        
        throttle = (-th / 200.0f) * max_throttle;
        steering = st / 200.0f;
        if (steering > 0)
          steering = (steering * steering + 0.5 * steering) * max_steering;
        else
          steering = (-steering * steering + 0.5 * steering) * max_steering;
        break;
      }
      case 2: {
        data = nextInt(data);
        angle_offset = stringToInt(data) / 10.0;
        data = nextInt(data);
        Kp_user = KP * (stringToInt(data) + 100.0) / 100.0;
        data = nextInt(data);
        Kd_user = KD * (stringToInt(data) + 100.0) / 100.0;
        data = nextInt(data);
        Kp_thr_user = KP_THROTTLE * (stringToInt(data) + 100.0) / 100.0;
        data = nextInt(data);
        Ki_thr_user = KI_THROTTLE * (stringToInt(data) + 100.0) / 100.0;
        break;
      }
      case 3: {
        tPush = millis() + 1500;
        if (angle_ready > 0) {
          angle_ready = -1;
        } else {
          setEnableMotor(true);
          if (angle_adjusted > 0) {
            motor1 = motor2 = speed_M1 = speed_M2 = 50;
          } else {
            motor1 = motor2 = speed_M1 = speed_M2 = -50;
          }
          setMotorSpeedM1(motor1);
          setMotorSpeedM2(motor2);
          updateStep();
          delay(400);
          angle_ready = 90;
        }
        break;
      }
      case 4: {
        data = nextInt(data);
        int m = stringToInt(data);
        if (modeSpeed == 0 && m == 1) {
          max_throttle = MAX_THROTTLE_PRO;
          max_steering = MAX_STEERING_PRO;
          max_target_angle = MAX_TARGET_ANGLE_PRO;
          modeSpeed = 1;
        } else if (modeSpeed == 1 && m == 0) {
          max_throttle = MAX_THROTTLE;
          max_steering = MAX_STEERING;
          max_target_angle = MAX_TARGET_ANGLE;
          modeSpeed = 0;
        }
        break;
      }
    } 
  }
}
