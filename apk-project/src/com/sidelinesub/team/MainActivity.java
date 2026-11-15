package com.sidelinesub.team;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.*;
import java.nio.charset.StandardCharsets;
public class MainActivity extends Activity implements Runnable {
  public void run(){ load(); }
  static final int BUILD = 40;
  private WebView web;
  File bundleFile(){ return new File(getFilesDir(), "bundle.html"); }
  File verFile(){ return new File(getFilesDir(), "bundle.v"); }
  int bundleVersion(){ try{ return Integer.parseInt(readFile(verFile()).trim()); }catch(Exception e){ return 0; } }
  String readFile(File f) throws IOException { byte[] b=new byte[(int)f.length()]; try(FileInputStream in=new FileInputStream(f)){ int o=0,n; while(o<b.length&&(n=in.read(b,o,b.length-o))>0) o+=n; } return new String(b,StandardCharsets.UTF_8); }
  void writeFile(File f,String s) throws IOException { File t=new File(f.getPath()+".tmp"); try(FileOutputStream out=new FileOutputStream(t)){ out.write(s.getBytes(StandardCharsets.UTF_8)); } if(!t.renameTo(f)) throw new IOException("rename"); }
  void load(){
    int bv=bundleVersion();
    if(bv>BUILD && bundleFile().exists()){
      try{ String html=readFile(bundleFile());
        html="<script>window.BB_FROM_BUNDLE="+bv+";</script>"+html;
        web.loadDataWithBaseURL("file:///android_asset/index.html", html, "text/html", "utf-8", null); return; }
      catch(Exception e){ bundleFile().delete(); verFile().delete(); }
    }
    web.loadUrl("file:///android_asset/index.html");
  }
  @Override protected void onCreate(Bundle b){
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    web=new WebView(this);
    WebSettings s=web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(true);
    s.setAllowUniversalAccessFromFileURLs(true);
    s.setAllowFileAccessFromFileURLs(true);
    s.setTextZoom(100);
    s.setUseWideViewPort(true);
    s.setLoadWithOverviewMode(true);
    web.setWebViewClient(new WebViewClient());
    NativeBridge bridge=new NativeBridge(this);
    web.addJavascriptInterface(bridge, "BBNative");
    web.addJavascriptInterface(bridge, "SidelineAndroid");
    web.setBackgroundColor(0xFFFFFFFF);
    setContentView(web);
    load();
  }
  @Override protected void onPause(){ super.onPause(); SubAlertService.pageVisible=false; }
  @Override protected void onResume(){ super.onResume(); SubAlertService.pageVisible=true; }
  void scheduleAlerts(long dueAt, long leadMs){
    if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)
      requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 41);
    SubAlertService.start(this, dueAt, leadMs);
  }
  void cancelAlerts(){ SubAlertService.stop(this); }
  void vibrateMs(int ms){
    Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);
    if(v==null) return;
    if(Build.VERSION.SDK_INT>=26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
    else v.vibrate(ms);
  }
  @Override public void onBackPressed(){ moveTaskToBack(true); }
}
