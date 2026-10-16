package edu.lumenacademy.teacherportal;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * FLAG_SECURE before anything is drawn: screenshots fail, screen recording
     * and casting show black, and the app is blank in the recents switcher.
     *
     * Set here rather than only through the privacy-screen plugin, which runs
     * from JavaScript once the page has loaded — this covers the first frames
     * and any case where the plugin call fails. It is never cleared.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        super.onCreate(savedInstanceState);
    }
}
