package com.sidelinesub.team;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
/* One-shot delays from an absolute timestamp. This does not tick the game clock. */
public class SubAlertService extends Service {
  public static volatile boolean pageVisible = true;
  static final String CH_ONGOING = "sideline-clock";
  static final String CH_ALERT = "sideline-sub";
  static final int ID_ONGOING = 40;
  static final int ID_ALERT = 41;
  final Handler handler = new Handler(Looper.getMainLooper());

  public static void start(Context ctx, long dueAt, long leadMs){
    Intent i = new Intent(ctx, SubAlertService.class);
    i.putExtra("due", dueAt);
    i.putExtra("lead", leadMs);
    if(Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
    else ctx.startService(i);
  }
  public static void stop(Context ctx){ ctx.stopService(new Intent(ctx, SubAlertService.class)); }

  public static void alertNow(Context ctx, String title, String body){
    ensureChannels(ctx);
    NotificationManager nm = (NotificationManager)ctx.getSystemService(NOTIFICATION_SERVICE);
    if(nm == null) return;
    nm.notify(ID_ALERT, note(ctx, CH_ALERT, title, body).setAutoCancel(true).build());
    vibrate(ctx);
  }

  static void ensureChannels(Context ctx){
    if(Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = (NotificationManager)ctx.getSystemService(NOTIFICATION_SERVICE);
    if(nm == null) return;
    NotificationChannel ongoing = new NotificationChannel(CH_ONGOING, "Game clock", NotificationManager.IMPORTANCE_LOW);
    NotificationChannel alert = new NotificationChannel(CH_ALERT, "Sub reminders", NotificationManager.IMPORTANCE_HIGH);
    alert.enableVibration(true);
    nm.createNotificationChannel(ongoing);
    nm.createNotificationChannel(alert);
  }
  static void vibrate(Context ctx){
    Vibrator v = (Vibrator)ctx.getSystemService(VIBRATOR_SERVICE);
    if(v == null) return;
    if(Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(250, VibrationEffect.DEFAULT_AMPLITUDE));
    else v.vibrate(250);
  }
  static Notification.Builder note(Context ctx, String channel, String title, String body){
    Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, channel) : new Notification.Builder(ctx);
    Intent open = new Intent(ctx, MainActivity.class);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, flags);
    return b.setContentTitle(title).setContentText(body).setSmallIcon(android.R.drawable.ic_dialog_info).setContentIntent(pi);
  }

  @Override public IBinder onBind(Intent intent){ return null; }
  @Override public void onCreate(){
    super.onCreate();
    ensureChannels(this);
  }
  @Override public int onStartCommand(Intent intent, int flags, int startId){
    Notification ongoing = note(this, CH_ONGOING, "Game clock running", "Sideline Sub will remind you at the next sub window.").setOngoing(true).build();
    try{
      if(Build.VERSION.SDK_INT >= 34) startForeground(ID_ONGOING, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
      else startForeground(ID_ONGOING, ongoing);
    }catch(Exception e){ stopSelf(); return START_NOT_STICKY; }
    handler.removeCallbacksAndMessages(null);
    if(intent == null) return START_NOT_STICKY;
    long due = intent.getLongExtra("due", 0);
    long lead = intent.getLongExtra("lead", 0);
    long now = System.currentTimeMillis();
    if(lead > 0){
      int sec = (int)Math.max(1, lead / 1000);
      handler.postDelayed(() -> { if(!pageVisible) alertNow(this, "Sub coming up", "About " + sec + " seconds until the next sub."); }, Math.max(0, due - lead - now));
    }
    handler.postDelayed(() -> { if(!pageVisible) alertNow(this, "Sub now", "The sub window is up."); }, Math.max(0, due - now));
    return START_NOT_STICKY;
  }
  @Override public void onDestroy(){
    handler.removeCallbacksAndMessages(null);
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }
}
