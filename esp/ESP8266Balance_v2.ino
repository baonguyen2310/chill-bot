
#include <Wire.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPUpdateServer.h>

ESP8266WebServer httpServer(80);
ESP8266HTTPUpdateServer httpUpdater;

const char* ssid = "Hehe12343";
const char* password = "018695762411";

#define MAX_THROTTLE 500
#define MAX_STEERING 180
#define MAX_TARGET_ANGLE 14

#define MAX_THROTTLE_PRO 700
#define MAX_STEERING_PRO 240
#define MAX_TARGET_ANGLE_PRO 18

#define KP 0.38
#define KD 0.056
#define KP_THROTTLE 0.075
#define KI_THROTTLE 0.1

#define KP_RAISEUP 0.1   
#define KD_RAISEUP 0.16   
#define KP_THROTTLE_RAISEUP 0
#define KI_THROTTLE_RAISEUP 0.0

#define MAX_CONTROL_OUTPUT 500
#define ITERM_MAX_ERROR 30
#define ITERM_MAX 10000

#define ZERO_SPEED 1600000
#define MAX_ACCEL 14

#define RAD2GRAD 57.2957795

long timer_old;
long timer_value;
float debugVariable;
float dt;

float angle_adjusted;
float angle_adjusted_Old;

// Default control values from constant definitions
float Kp = KP;
float Kd = KD;
float Kp_thr = KP_THROTTLE;
float Ki_thr = KI_THROTTLE;
float Kp_user = KP;
float Kd_user = KD;
float Kp_thr_user = KP_THROTTLE;
float Ki_thr_user = KI_THROTTLE;

float PID_errorSum;
float PID_errorOld = 0;
float setPointOld = 0;
float target_angle;
int16_t throttle;
float steering;
float max_throttle = MAX_THROTTLE;
float max_steering = MAX_STEERING;
float max_target_angle = MAX_TARGET_ANGLE;
float control_output;
float angle_offset = 0;

int angle_ready = 0;

int16_t motor1;
int16_t motor2;

// position control
volatile int32_t steps1;
volatile int32_t steps2;
int32_t target_steps1;
int32_t target_steps2;
int16_t motor1_control;
int16_t motor2_control;

int32_t speed_M1, speed_M2;        // Actual speed of motors
volatile int8_t dir_M1, dir_M2;            // Actual direction of steppers motors
int16_t actual_robot_speed;        // overall robot speed (measured from steppers speed)
int16_t actual_robot_speed_Old;
float estimated_speed_filtered;    // Estimated robot speed

#define STEP_1 D6
#define DIR_1 D5
#define STEP_2 D8
#define DIR_2 D7
#define DISABLE_STEP D0

WiFiUDP Udp;

volatile uint32_t timer_period_1 = ZERO_SPEED;
volatile uint32_t timer_period_2 = ZERO_SPEED;
volatile uint32_t t_step_1, t_step_2;
volatile int8_t type_step = 0;

uint8_t modeSpeed = 0;

volatile uint32_t tickInterrupt = 0;

void ICACHE_RAM_ATTR interruptTimer();

long timeSendVon = 0;
float von = 12.6;
IPAddress ipRemote;
int portRemote = 0;

void setEnableMotor(bool enable) {
  if (enable) {
    digitalWrite(DISABLE_STEP, 0);  // Enable motors
  } else {
    digitalWrite(DISABLE_STEP, 1);  // Disbale motors
  }
}

void setup()
{
  // STEPPER PINS ON JJROBOTS BROBOT BRAIN BOARD
  pinMode(DISABLE_STEP, OUTPUT); // DISABLE MOTORS
  pinMode(STEP_1, OUTPUT); // STEP MOTOR 1
  pinMode(DIR_1, OUTPUT); // DIR MOTOR 1
  pinMode(STEP_2, OUTPUT); // STEP MOTOR 2
  pinMode(DIR_2, OUTPUT); // DIR MOTOR 2
  
  digitalWrite(STEP_1, 0);
  digitalWrite(DIR_1, 0);
  digitalWrite(STEP_2, 0);
  digitalWrite(DIR_2, 0);
  setEnableMotor(false);

  Serial.begin(115200);

  WiFi.mode(WIFI_AP_STA);
  
  WiFi.softAP("Robot balance-V2", "12345678");
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected! IP address: ");
  Serial.println(WiFi.localIP());

  httpUpdater.setup(&httpServer);

  // Thêm endpoint đơn giản để xem IP
  httpServer.on("/ip", HTTP_GET, []() {
    String response = "AP IP: " + WiFi.softAPIP().toString() + "\n";
    response += "STA IP: " + WiFi.localIP().toString();
    httpServer.send(200, "text/plain", response);
  });

  httpServer.begin();

  Wire.begin();
  
  delay(100);
  Serial.println("\n\nInit robot balance");

  //Khởi tạo UDP server
  Serial.println("Start UDP server");
  Udp.begin(8844);
  
  //Giữ yên robot trong vòng 10s để calibrate cảm biến MPU6050
  Serial.println("Don't move for 10 sec...");
  MPU6050_setup();
  delay(200);

  MPU6050_calibrate();

  //Khởi tạo timer sử dụng cho động cơ bước
  Serial.println("Steppers init");
  t_step_1 = t_step_2 = ESP.getCycleCount();
  timer1_isr_init();
  timer1_attachInterrupt(interruptTimer);
  timer1_enable(TIM_DIV1, TIM_EDGE, TIM_SINGLE);//80MHz (80 ticks/us)
  timer1_write(ZERO_SPEED);
  
  delay(200);

  //Rung motor để biết robot đã sẵn sàng
  setEnableMotor(true);
  for (uint8_t k = 0; k < 3; k++)
  {
    setMotorSpeedM1(2);
    setMotorSpeedM2(2);
    updateStep();
    delay(200);
    setMotorSpeedM1(-2);
    setMotorSpeedM2(-2);
    updateStep();
    delay(200);
  }
  setEnableMotor(false);
  //Hết rung motor
  
  setMotorSpeedM1(0);
  setMotorSpeedM2(0);
  updateStep();

  Serial.println("Start...");
  delay(20);

  timer_old = micros();
}

long tPush = 0;
boolean isPush = false;
byte A[54];
int k = 0;

bool clearRX = true;
long t_read = 0;

long t_send = 0;


void loop()
{
  //Kiểm tra cập nhật firmware qua wifi
  httpServer.handleClient();

  //Nhận tín hiệu điều khiển từ app qua wifi nếu có
  readUdp();
  
  timer_value = micros();

  // Kiểm tra nếu cảm biến MPU6050 có giá trị mới thì xử lý tiếp
  if (MPU6050_newData())
  {
    //Đọc cảm biến MPU6050
    MPU6050_read_3axis();

    dt = (timer_value - timer_old) * 0.000001;
    timer_old = timer_value;

    angle_adjusted_Old = angle_adjusted;

    //Tính góc mới từ dữ liệu của MPU6050 vừa đọc ở trên
    float MPU_sensor_angle = MPU6050_getAngle(dt);
    angle_adjusted = MPU_sensor_angle + angle_offset;
    Serial.println(MPU_sensor_angle);
      
    actual_robot_speed = (speed_M1 + speed_M2) / 2;

    int16_t angular_velocity = (angle_adjusted - angle_adjusted_Old) * 25.0;
    int16_t estimated_speed = -actual_robot_speed + angular_velocity;
    estimated_speed_filtered = estimated_speed_filtered * 0.9 + (float)estimated_speed * 0.1; // low pass filter on estimated speed

    //PID tính góc nghiêng để chạy được với tốc độ điều khiển
    target_angle = speedPIControl(dt, estimated_speed_filtered, throttle, Kp_thr, Ki_thr);
    target_angle = constrain(target_angle, -max_target_angle, max_target_angle); // limited output

    //PID tốc độ của động cơ
    control_output += stabilityPDControl(dt, angle_adjusted, target_angle, Kp, Kd);
    control_output = constrain(control_output, -MAX_CONTROL_OUTPUT, MAX_CONTROL_OUTPUT); // Limit max output from control

    //Tốc độ của mỗi động cơ
    motor1 = control_output + steering;
    motor2 = control_output - steering;

    // Giới hạn tốc độ tối đa mỗi động cơ
    motor1 = constrain(motor1, -MAX_CONTROL_OUTPUT, MAX_CONTROL_OUTPUT);
    motor2 = constrain(motor2, -MAX_CONTROL_OUTPUT, MAX_CONTROL_OUTPUT);
    
    if (millis() > tPush) {
      if (angle_ready > 0) {
        angle_ready = 60;
      }
    }

    if (angle_ready == 0) {
      if (throttle != 0 || steering != 0) {

        setEnableMotor(true);

        if (angle_adjusted < 0) {
          motor1 = -throttle / 4 + steering / 2;
          motor2 = -throttle / 4 - steering / 2;
        } else {
          motor1 = throttle / 4 + steering / 2;
          motor2 = throttle / 4 - steering / 2;
        }
    
        setMotorSpeedM1(motor1);
        setMotorSpeedM2(motor2);
        updateStep();
      } else {
        
        setEnableMotor(false);
        setMotorSpeedM1(0);
        setMotorSpeedM2(0);
      }
    }

    if ((angle_adjusted > -angle_ready) && (angle_adjusted < angle_ready))
    {
      setEnableMotor(true);

      setMotorSpeedM1(motor1);
      setMotorSpeedM2(motor2);
      updateStep();
    }
    else
    {
      if (angle_ready != 0) {
        setEnableMotor(false);
        setMotorSpeedM1(0);
        setMotorSpeedM2(0);
        PID_errorSum = 0;
      }
      angle_ready = 0;
    }


    if ((angle_adjusted > -50) && (angle_adjusted < 50))
    {
      Kp = Kp_user;
      Kd = Kd_user;
      Kp_thr = Kp_thr_user;
      Ki_thr = Ki_thr_user;
    }
    else
    {
      Kp = KP_RAISEUP;
      Kd = KD_RAISEUP;
      Kp_thr = KP_THROTTLE_RAISEUP;
      Ki_thr = KI_THROTTLE_RAISEUP;
    }
    
//    float v = (analogRead(A0) * 3.07 * 4.347 / 1024) + 0.7;
//    von = (von * 49 + v) / 50;
//
//    //Đo vôn của pin gửi về app
//    if (millis() > timeSendVon) {
//      timeSendVon = millis() + 500;
//      if (portRemote > 0) {
//        Udp.beginPacket(ipRemote, portRemote);
//        Udp.printf("V:%f", von);
//        Udp.endPacket();
//      }
//    }
  }

}
