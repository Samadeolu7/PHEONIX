# notifications/providers.py
from abc import ABC, abstractmethod
from typing import Dict
import requests
import logging
from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings

logger = logging.getLogger(__name__)


class NotificationProvider(ABC):
    """Base class for notification providers"""
    
    @abstractmethod
    def send(
        self,
        recipient: str,
        subject: str,
        message: str,
        html_message: str = '',
        channel_config: dict = None
    ) -> Dict:
        """
        Send notification
        
        Returns:
            {
                'success': bool,
                'message_id': str (optional),
                'delivered': bool (optional),
                'error': str (if failed),
                'retryable': bool (if failed)
            }
        """
        pass
    
    @abstractmethod
    def check_status(self, message_id: str, channel_config: dict = None) -> Dict:
        """
        Check delivery status
        
        Returns:
            {
                'delivered': bool,
                'failed': bool,
                'error': str (if failed)
            }
        """
        pass


class EmailProvider(NotificationProvider):
    """Email notification provider"""
    
    def send(
        self,
        recipient: str,
        subject: str,
        message: str,
        html_message: str = '',
        channel_config: dict = None
    ) -> Dict:
        """Send email via Django's email backend"""
        try:
            config = channel_config or {}
            from_email = config.get('from_email', settings.DEFAULT_FROM_EMAIL)
            reply_to = config.get('reply_to')
            
            if html_message:
                # Send HTML email
                email = EmailMultiAlternatives(
                    subject=subject,
                    body=message,
                    from_email=from_email,
                    to=[recipient],
                    reply_to=[reply_to] if reply_to else None
                )
                email.attach_alternative(html_message, "text/html")
                email.send()
            else:
                # Send plain text
                send_mail(
                    subject=subject,
                    message=message,
                    from_email=from_email,
                    recipient_list=[recipient],
                    fail_silently=False
                )
            
            return {
                'success': True,
                'message_id': '',  # Django doesn't return message ID
                'delivered': False  # Can't confirm delivery immediately
            }
        
        except Exception as e:
            logger.exception(f"Email sending failed to {recipient}")
            return {
                'success': False,
                'error': str(e),
                'retryable': True
            }
    
    def check_status(self, message_id: str, channel_config: dict = None) -> Dict:
        """Email providers typically don't support status checking via API"""
        return {
            'delivered': False,
            'failed': False,
            'error': 'Status checking not supported for email'
        }


class SMSProvider(NotificationProvider):
    """SMS notification provider - supports multiple backends"""
    
    def send(
        self,
        recipient: str,
        subject: str,
        message: str,
        html_message: str = '',
        channel_config: dict = None
    ) -> Dict:
        """Send SMS via configured provider"""
        config = channel_config or {}
        provider = config.get('provider', 'termii')
        
        if provider == 'termii':
            return self._send_termii(recipient, message, config)
        elif provider == 'twilio':
            return self._send_twilio(recipient, message, config)
        elif provider == 'africas_talking':
            return self._send_africas_talking(recipient, message, config)
        else:
            return {
                'success': False,
                'error': f'Unknown SMS provider: {provider}',
                'retryable': False
            }
    
    def _send_termii(self, recipient: str, message: str, config: dict) -> Dict:
        """Send via Termii (Nigerian SMS provider)"""
        try:
            api_key = config.get('api_key')
            sender_id = config.get('sender_id', 'YourBrand')
            
            # Clean phone number
            phone = self._clean_phone_number(recipient)
            
            response = requests.post(
                'https://api.ng.termii.com/api/sms/send',
                json={
                    'to': phone,
                    'from': sender_id,
                    'sms': message,
                    'type': 'plain',
                    'channel': 'generic',
                    'api_key': api_key
                },
                timeout=30
            )
            
            result = response.json()
            
            if response.status_code == 200 and result.get('message_id'):
                return {
                    'success': True,
                    'message_id': result['message_id'],
                    'delivered': False
                }
            else:
                return {
                    'success': False,
                    'error': result.get('message', 'Unknown error'),
                    'retryable': True
                }
        
        except Exception as e:
            logger.exception(f"Termii SMS failed to {recipient}")
            return {
                'success': False,
                'error': str(e),
                'retryable': True
            }
    
    def _send_twilio(self, recipient: str, message: str, config: dict) -> Dict:
        """Send via Twilio"""
        try:
            from twilio.rest import Client
            
            account_sid = config.get('account_sid')
            auth_token = config.get('auth_token')
            from_number = config.get('from_number')
            
            client = Client(account_sid, auth_token)
            
            phone = self._clean_phone_number(recipient)
            
            result = client.messages.create(
                body=message,
                from_=from_number,
                to=phone
            )
            
            return {
                'success': True,
                'message_id': result.sid,
                'delivered': False
            }
        
        except Exception as e:
            logger.exception(f"Twilio SMS failed to {recipient}")
            return {
                'success': False,
                'error': str(e),
                'retryable': True
            }
    
    def _send_africas_talking(self, recipient: str, message: str, config: dict) -> Dict:
        """Send via Africa's Talking"""
        try:
            import africastalking
            
            username = config.get('username', 'sandbox')
            api_key = config.get('api_key')
            
            africastalking.initialize(username, api_key)
            sms = africastalking.SMS
            
            phone = self._clean_phone_number(recipient)
            
            response = sms.send(message, [phone])
            
            if response['SMSMessageData']['Recipients']:
                recipient_data = response['SMSMessageData']['Recipients'][0]
                if recipient_data['status'] == 'Success':
                    return {
                        'success': True,
                        'message_id': recipient_data.get('messageId', ''),
                        'delivered': False
                    }
            
            return {
                'success': False,
                'error': 'SMS sending failed',
                'retryable': True
            }
        
        except Exception as e:
            logger.exception(f"Africa's Talking SMS failed to {recipient}")
            return {
                'success': False,
                'error': str(e),
                'retryable': True
            }
    
    def _clean_phone_number(self, phone: str) -> str:
        """Clean and format phone number"""
        # Remove non-numeric characters
        cleaned = ''.join(c for c in phone if c.isdigit() or c == '+')
        
        # Add +234 for Nigerian numbers if needed
        if cleaned.startswith('0') and len(cleaned) == 11:
            cleaned = '+234' + cleaned[1:]
        elif not cleaned.startswith('+'):
            cleaned = '+' + cleaned
        
        return cleaned
    
    def check_status(self, message_id: str, channel_config: dict = None) -> Dict:
        """Check SMS delivery status"""
        config = channel_config or {}
        provider = config.get('provider', 'termii')
        
        if provider == 'termii':
            return self._check_termii_status(message_id, config)
        elif provider == 'twilio':
            return self._check_twilio_status(message_id, config)
        
        return {
            'delivered': False,
            'failed': False,
            'error': 'Status checking not supported for this provider'
        }
    
    def _check_termii_status(self, message_id: str, config: dict) -> Dict:
        """Check Termii delivery status"""
        try:
            api_key = config.get('api_key')
            
            response = requests.get(
                f'https://api.ng.termii.com/api/sms/inbox',
                params={
                    'api_key': api_key,
                    'message_id': message_id
                },
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                status = result.get('status', '').lower()
                
                if status in ['delivered', 'sent']:
                    return {'delivered': True, 'failed': False}
                elif status in ['failed', 'rejected']:
                    return {'delivered': False, 'failed': True, 'error': 'Delivery failed'}
            
            return {'delivered': False, 'failed': False}
        
        except Exception as e:
            logger.exception(f"Error checking Termii status for {message_id}")
            return {'delivered': False, 'failed': False, 'error': str(e)}
    
    def _check_twilio_status(self, message_id: str, config: dict) -> Dict:
        """Check Twilio delivery status"""
        try:
            from twilio.rest import Client
            
            account_sid = config.get('account_sid')
            auth_token = config.get('auth_token')
            
            client = Client(account_sid, auth_token)
            message = client.messages(message_id).fetch()
            
            if message.status == 'delivered':
                return {'delivered': True, 'failed': False}
            elif message.status in ['failed', 'undelivered']:
                return {
                    'delivered': False,
                    'failed': True,
                    'error': message.error_message or 'Delivery failed'
                }
            
            return {'delivered': False, 'failed': False}
        
        except Exception as e:
            logger.exception(f"Error checking Twilio status for {message_id}")
            return {'delivered': False, 'failed': False, 'error': str(e)}


class WhatsAppProvider(NotificationProvider):
    """WhatsApp notification provider"""
    
    def send(
        self,
        recipient: str,
        subject: str,
        message: str,
        html_message: str = '',
        channel_config: dict = None
    ) -> Dict:
        """Send WhatsApp message"""
        config = channel_config or {}
        provider = config.get('provider', 'twilio')
        
        if provider == 'twilio':
            return self._send_twilio(recipient, message, config)
        elif provider == 'termii':
            return self._send_termii(recipient, message, config)
        
        return {
            'success': False,
            'error': f'Unknown WhatsApp provider: {provider}',
            'retryable': False
        }
    
    def _send_twilio(self, recipient: str, message: str, config: dict) -> Dict:
        """Send via Twilio WhatsApp"""
        try:
            from twilio.rest import Client
            
            account_sid = config.get('account_sid')
            auth_token = config.get('auth_token')
            from_number = config.get('from_number')  # e.g., 'whatsapp:+14155238886'
            
            client = Client(account_sid, auth_token)
            
            # Format phone for WhatsApp
            to_number = f"whatsapp:{recipient}"
            
            result = client.messages.create(
                body=message,
                from_=from_number,
                to=to_number
            )
            
            return {
                'success': True,
                'message_id': result.sid,
                'delivered': False
            }
        
        except Exception as e:
            logger.exception(f"Twilio WhatsApp failed to {recipient}")
            return {
                'success': False,
                'error': str(e),
                'retryable': True
            }
    
    def _send_termii(self, recipient: str, message: str, config: dict) -> Dict:
        """Send via Termii WhatsApp"""
        # Termii WhatsApp implementation
        # Similar to SMS but with WhatsApp endpoint
        return {
            'success': False,
            'error': 'Termii WhatsApp not yet implemented',
            'retryable': False
        }
    
    def check_status(self, message_id: str, channel_config: dict = None) -> Dict:
        """Check WhatsApp delivery status"""
        # Similar to SMS status checking
        return {
            'delivered': False,
            'failed': False,
            'error': 'Status checking not yet implemented'
        }


class TelegramProvider(NotificationProvider):
    """Telegram Bot API provider — sends to a fixed chat/group via sendMessage.

    `recipient` here is the Telegram chat_id (a group chat for a broadcast
    alert, not a per-user identifier). bot_token/chat_id are read from
    channel_config first (so an admin can rotate them without a redeploy,
    matching how SMSProvider._send_termii reads its api_key), falling back
    to the TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID settings.
    """

    def send(
        self,
        recipient: str,
        subject: str,
        message: str,
        html_message: str = '',
        channel_config: dict = None
    ) -> Dict:
        config = channel_config or {}
        bot_token = config.get('bot_token') or settings.TELEGRAM_BOT_TOKEN
        chat_id = recipient or config.get('chat_id') or settings.TELEGRAM_CHAT_ID

        if not bot_token or not chat_id:
            return {
                'success': False,
                'error': 'Telegram bot_token/chat_id not configured',
                'retryable': False
            }

        # Plain text, no parse_mode: subject/message are built from business
        # data (loan numbers, account names, voucher purposes, client names)
        # that can freely contain *, _, `, [ — any of which breaks Telegram's
        # Markdown entity parser (e.g. a stray "_" in "chat_id" is enough to
        # 400 the whole message with "can't find end of the entity").
        text = f"{subject}\n\n{message}" if subject else message

        try:
            response = requests.post(
                f'https://api.telegram.org/bot{bot_token}/sendMessage',
                json={
                    'chat_id': chat_id,
                    'text': text,
                },
                timeout=15
            )
            result = response.json()

            if response.status_code == 200 and result.get('ok'):
                return {
                    'success': True,
                    'message_id': str(result['result']['message_id']),
                    'delivered': True  # A successful sendMessage call IS delivery here
                }
            else:
                return {
                    'success': False,
                    'error': result.get('description', 'Unknown Telegram error'),
                    # A 400 (bad chat_id, bot not in group, malformed request) will
                    # fail identically on every retry — only retry on transient
                    # errors (429 rate limit, 5xx).
                    'retryable': response.status_code != 400,
                }

        except Exception as e:
            logger.exception(f"Telegram send failed to chat {chat_id}")
            return {
                'success': False,
                'error': str(e),
                'retryable': True
            }

    def check_status(self, message_id: str, channel_config: dict = None) -> Dict:
        """Telegram's Bot API has no delivery-status lookup for sendMessage —
        a successful send is already treated as delivered above."""
        return {
            'delivered': True,
            'failed': False,
            'error': 'Status checking not supported for Telegram'
        }


class PushProvider(NotificationProvider):
    """Push notification provider (Firebase, OneSignal, etc.)"""
    
    def send(
        self,
        recipient: str,
        subject: str,
        message: str,
        html_message: str = '',
        channel_config: dict = None
    ) -> Dict:
        """Send push notification"""
        config = channel_config or {}
        provider = config.get('provider', 'firebase')
        
        if provider == 'firebase':
            return self._send_firebase(recipient, subject, message, config)
        elif provider == 'onesignal':
            return self._send_onesignal(recipient, subject, message, config)
        
        return {
            'success': False,
            'error': f'Unknown push provider: {provider}',
            'retryable': False
        }
    
    def _send_firebase(
        self,
        recipient: str,
        subject: str,
        message: str,
        config: dict
    ) -> Dict:
        """Send via Firebase Cloud Messaging"""
        try:
            import firebase_admin
            from firebase_admin import messaging
            
            # recipient here would be FCM device token
            notification_message = messaging.Message(
                notification=messaging.Notification(
                    title=subject,
                    body=message,
                ),
                token=recipient,
            )
            
            response = messaging.send(notification_message)
            
            return {
                'success': True,
                'message_id': response,
                'delivered': True  # FCM confirms delivery
            }
        
        except Exception as e:
            logger.exception(f"Firebase push failed to {recipient}")
            return {
                'success': False,
                'error': str(e),
                'retryable': True
            }
    
    def _send_onesignal(
        self,
        recipient: str,
        subject: str,
        message: str,
        config: dict
    ) -> Dict:
        """Send via OneSignal"""
        try:
            app_id = config.get('app_id')
            api_key = config.get('api_key')
            
            response = requests.post(
                'https://onesignal.com/api/v1/notifications',
                headers={
                    'Authorization': f'Basic {api_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'app_id': app_id,
                    'include_player_ids': [recipient],
                    'headings': {'en': subject},
                    'contents': {'en': message}
                },
                timeout=30
            )
            
            result = response.json()
            
            if response.status_code == 200 and result.get('id'):
                return {
                    'success': True,
                    'message_id': result['id'],
                    'delivered': False
                }
            
            return {
                'success': False,
                'error': result.get('errors', ['Unknown error'])[0],
                'retryable': True
            }
        
        except Exception as e:
            logger.exception(f"OneSignal push failed to {recipient}")
            return {
                'success': False,
                'error': str(e),
                'retryable': True
            }
    
    def check_status(self, message_id: str, channel_config: dict = None) -> Dict:
        """Check push notification status"""
        return {
            'delivered': False,
            'failed': False,
            'error': 'Status checking not yet implemented'
        }


class InAppProvider(NotificationProvider):
    """In-app notification provider (stored in database)"""
    
    def send(
        self,
        recipient: str,
        subject: str,
        message: str,
        html_message: str = '',
        channel_config: dict = None
    ) -> Dict:
        """
        'Send' in-app notification (just marks as sent)
        In-app notifications are already in the database,
        this just updates their status
        """
        return {
            'success': True,
            'message_id': '',
            'delivered': True  # In-app is immediately 'delivered'
        }
    
    def check_status(self, message_id: str, channel_config: dict = None) -> Dict:
        """In-app notifications are always delivered"""
        return {
            'delivered': True,
            'failed': False
        }