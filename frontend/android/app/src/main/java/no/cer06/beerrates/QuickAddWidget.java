package no.cer06.beerrates;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * The home-screen widget: "Take photo" opens the add form with the camera running, "Add" opens
 * the add form. The links are handled in src/lib/quickActions.ts, like the app shortcuts.
 */
public class QuickAddWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_add);
            views.setOnClickPendingIntent(R.id.widget_photo, open(context, "drikkevurderinger://add?photo=camera", 1));
            views.setOnClickPendingIntent(R.id.widget_add, open(context, "drikkevurderinger://add", 2));
            manager.updateAppWidget(widgetId, views);
        }
    }

    private static PendingIntent open(Context context, String link, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
