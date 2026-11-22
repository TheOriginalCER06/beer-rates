package no.cer06.beerrates;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Android may close the app while the camera is open, and then starts it again with the
        // intent that first opened it. A shortcut or widget link in it has been handled already:
        // drop it, or the camera would open a second time on top of the restored photo.
        Intent intent = getIntent();
        if (savedInstanceState != null && intent != null && "drikkevurderinger".equals(intent.getScheme())) {
            intent.setData(null);
        }
        super.onCreate(savedInstanceState);
    }
}
